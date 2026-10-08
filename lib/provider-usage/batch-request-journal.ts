import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { beginUsageEntry } from "@/lib/metering/entry-sync";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { type OwnAttemptGrant, ownAdmission } from "./admission-extension";
import { type ByokEvidenceInput, captureByokEvidence } from "./byok-evidence";
import { recordProviderUsage } from "./recorder";

/** The whole native POST taskset owns one database commit and one possible-send fence. */
export async function beginProviderTaskset(
  db: PrismaClient,
  inputs: readonly (ByokEvidenceInput & { keywordId: string })[],
) {
  const identities = inputs.map((input) => ({
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
  const grants = await db
    .$transaction(async (tx) => {
      for (const { input, id } of identities) {
        const evidence = await captureByokEvidence(tx, input, id);
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
        const unresolved =
          (await tx.providerCostEntry.findFirst(query)) ??
          (await tx.meteringUsageEvidence.findFirst({
            ...query,
            where: { ...query.where, discarded: false },
          }));
        if (unresolved)
          throw new ProviderUsagePersistenceError({ phase: "admission", attemptId: unresolved.id });
        await recordProviderUsage(tx, {
          ...input,
          id,
          createdAt: evidence.createdAt,
          costCents: 0,
          failed: false,
          measurementStatus: "unknown",
        });
      }
      return ownAdmission.reserve(
        tx,
        identities.map(({ input, id }) => ({
          id,
          queued: true,
          credentialVersion: input.credentialVersion ?? null,
        })),
      );
    })
    .catch((cause) => {
      if (
        cause instanceof DeploymentAdmissionExhaustedError ||
        cause instanceof ProviderUsagePersistenceError
      )
        throw cause;
      throw new ProviderUsagePersistenceError({ cause, phase: "admission" });
    });
  for (const { input, id } of identities)
    await beginUsageEntry(id, input.estimate ?? { cents: "0", units: "1" }, true);
  return { identities, grants: grants as OwnAttemptGrant[] };
}
