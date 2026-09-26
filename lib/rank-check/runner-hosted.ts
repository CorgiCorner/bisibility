import "server-only";

import { prisma } from "@/lib/db/prisma";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { createProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { startDeploymentExecution } from "@/lib/providers/execution-extension";
import { exactExecutionEstimate } from "@/lib/providers/execution-extension-estimate";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import type { SerpDepth } from "@/lib/serp/constants";
import { estimatedRankCheckCostCents } from "./default-cost";
import type { RunCheckInput } from "./runner";

export async function assertLiveSourceAtDispatch(input: RunCheckInput) {
  if (!input.connection.id) return;
  const current = await prisma.providerConnection.findUnique({
    select: {
      credentialSource: true,
      enabled: true,
      projectId: true,
      provider: true,
      status: true,
      updatedAt: true,
    },
    where: { id: input.connection.id },
  });
  if (
    !current ||
    current.projectId !== input.projectId ||
    current.provider !== input.connection.provider ||
    current.enabled === false ||
    (current.status && current.status !== "connected") ||
    (input.connection.credentialSource &&
      current.credentialSource !== input.connection.credentialSource) ||
    (input.connection.updatedAt &&
      current.updatedAt?.getTime() !== input.connection.updatedAt.getTime())
  ) {
    throw new ProviderUsagePersistenceError({
      cause: new Error("Provider connection changed before dispatch."),
    });
  }
}

/** Recheck the current source before credentials and mint one live dispatch permit. */
export async function prepareLiveRankExecution(
  input: RunCheckInput,
  provider: string,
  depth: SerpDepth,
) {
  const current = input.connection.id
    ? await prisma.providerConnection.findUnique({
        select: {
          credentialSource: true,
          enabled: true,
          projectId: true,
          provider: true,
          status: true,
          updatedAt: true,
        },
        where: { id: input.connection.id },
      })
    : null;
  if (
    input.connection.id &&
    (current?.projectId !== input.projectId ||
      current?.provider !== provider ||
      current.enabled === false ||
      (current.status && current.status !== "connected") ||
      (input.connection.updatedAt &&
        current.updatedAt?.getTime() !== input.connection.updatedAt.getTime()))
  ) {
    throw new ProviderUsagePersistenceError({ cause: new Error("Provider connection mismatch.") });
  }
  const hosted = current?.credentialSource === "hosted";
  if (
    current &&
    input.connection.credentialSource &&
    current.credentialSource !== input.connection.credentialSource
  ) {
    throw new ProviderUsagePersistenceError({
      cause: new Error("Provider source changed before dispatch."),
    });
  }
  if (current && current.credentialSource !== "own" && !hosted) {
    throw new ProviderUsagePersistenceError({ cause: new Error("Unknown credential source.") });
  }
  if (hosted && (!input.projectId || !input.providerUsage || !input.rankCheckId)) {
    throw new ProviderUsagePersistenceError({
      cause: new Error("Rank execution identity unavailable."),
    });
  }
  const providerUsage =
    hosted && input.providerUsage
      ? await createProviderRequestAttribution(
          input.providerUsage.context,
          input.providerUsage.credential,
          "hosted",
        )
      : input.providerUsage;
  const execution =
    hosted && input.connection.id && input.projectId && providerUsage && input.rankCheckId
      ? await startDeploymentExecution({
          attribution: providerUsage,
          connectionId: input.connection.id,
          credential: providerUsage.credential,
          estimatedCostCents: exactExecutionEstimate(
            estimatedRankCheckCostCents(provider, depth, null, LIST_PROVIDER_RATE_CONTEXT),
            4,
          ),
          // Depth changes estimated cost; one rank task is one native operation.
          estimatedQuantity: "1.000000",
          keywordId: input.keyword.id,
          operationKey: `rank-check:${input.rankCheckId}`,
          provider,
          rankCheckId: input.rankCheckId,
        })
      : null;
  if (hosted && !execution) {
    throw new ProviderUsagePersistenceError({
      cause: new Error("Deployment execution unavailable."),
    });
  }
  return { execution, hosted, providerUsage };
}
