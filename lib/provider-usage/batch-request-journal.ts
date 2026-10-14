import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import type { NativeRequestGuard } from "@/lib/metering/paid-attempt-types";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import type { ProviderRequest } from "@usagekit/providers";
import { type OwnAttemptGrant, ownAdmission } from "./admission-extension";
import { type ByokEvidenceInput, captureByokEvidence } from "./byok-evidence";

/** The whole native POST taskset owns one database commit and one possible-send fence. */
export async function beginProviderTaskset(
  db: PrismaClient,
  inputs: readonly (ByokEvidenceInput & { keywordId: string; providerRequest?: ProviderRequest })[],
  beforeReserve?: ReadonlyMap<string, NativeRequestGuard>,
) {
  const identities = structuredClone(inputs).map((input) => ({
    input,
    id: createHash("sha256")
      .update(
        JSON.stringify([
          "byok-queued",
          input.connectionId,
          input.attribution.context.correlationId,
        ]),
      )
      .digest("hex"),
  }));
  if (
    beforeReserve &&
    identities.some(({ input }) => !beforeReserve.has(input.attribution.context.correlationId))
  )
    throw new ProviderUsagePersistenceError({ phase: "admission" });
  const grants = await db
    .$transaction(async (tx) => {
      for (const { input, id } of [...identities].sort((a, b) =>
        a.input.keywordId.localeCompare(b.input.keywordId),
      ))
        await beforeReserve
          ?.get(input.attribution.context.correlationId)
          ?.lockBusiness(tx, id, input.providerRequest);
      for (const { input, id } of identities) {
        await captureByokEvidence(tx, input, id);
        await beforeReserve
          ?.get(input.attribution.context.correlationId)
          ?.assertRequest(tx, id, input.providerRequest);
        const query = {
          select: { id: true },
          where: {
            connectionId: input.connectionId,
            projectId: input.projectId,
            correlationId: input.attribution.context.correlationId,
            measurementStatus: "unknown",
            id: { not: id },
          },
        };
        const unresolved = await tx.meteringUsageEvidence.findFirst({
          ...query,
          where: { ...query.where, discarded: false },
        });
        if (unresolved)
          throw new ProviderUsagePersistenceError({ phase: "admission", attemptId: unresolved.id });
      }
      return ownAdmission.reserve(
        tx,
        identities.map(({ input, id }) => ({
          id,
          queued: true,
          credentialVersion: input.credentialVersion ?? null,
          ...(input.providerRequest ? { providerRequest: input.providerRequest } : {}),
          attribution: {
            tag: input.attribution.tag,
            trigger: input.attribution.context.trigger,
            keywordId: input.keywordId,
          },
        })),
      );
    })
    .catch((cause) => {
      if (
        cause instanceof DeploymentAdmissionExhaustedError ||
        cause instanceof BudgetExhaustedError ||
        cause instanceof ProviderAllocationExhaustedError ||
        cause instanceof ProviderUsagePersistenceError
      )
        throw cause;
      throw new ProviderUsagePersistenceError({ cause, phase: "admission" });
    });
  return { identities, grants: grants as OwnAttemptGrant[] };
}
