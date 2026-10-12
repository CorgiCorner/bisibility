import "server-only";
import type { Prisma } from "../generated/prisma/client";
import { lockProjectForProviderMutation } from "../provider-allocations/project-lock";
import { loadProviderRateContext } from "../provider-rates/connection-context";
import { ProviderQuoteUnavailableError } from "../provider-rates/native-quote";
import { loadNativeRankRequestCosts } from "../provider-rates/native-rank-request";
import { LIST_PROVIDER_RATE_CONTEXT } from "../provider-rates/resolver";
import { estimatedRankCheckCostCents } from "../rank-check/default-cost";
import { serpProviderChainOrderBy } from "../rank-check/provider-chain-order";
import { resolveEffectiveSerpDepth } from "../serp/constants";
import type { RankCheckActivityInput } from "./rank-check-activity-contract";

/** Read the request and its price under the same locks as the running row. */
export async function runningReservation(
  input: RankCheckActivityInput,
  db: Prisma.TransactionClient,
) {
  const anchor = await db.keyword.findUnique({
    where: { id: input.keywordId },
    select: { projectId: true },
  });
  if (!anchor) throw new Error("Keyword not found.");
  await lockProjectForProviderMutation(db, anchor.projectId);
  await db.$queryRaw`SELECT "id" FROM "keywords" WHERE "id" = ${input.keywordId} AND "projectId" = ${anchor.projectId} FOR UPDATE`;
  const connection = await db.providerConnection.findFirst({
    orderBy: serpProviderChainOrderBy(),
    select: {
      credentialSource: true,
      credentialsEncrypted: true,
      id: true,
      projectId: true,
      provider: true,
    },
    where: {
      enabled: true,
      kind: "serp",
      projectId: anchor.projectId,
      ...(input.providerId ? { provider: input.providerId } : {}),
      status: "connected",
    },
  });
  const keyword = await db.keyword.findUnique({
    select: {
      text: true,
      projectId: true,
      publicId: true,
      project: { select: { defaults: { select: { serpDepth: true } } } },
      checkSchedule: { select: { serpDepth: true } },
      schedule: { select: { serpDepth: true } },
    },
    where: { id: input.keywordId },
  });
  if (!keyword || keyword.projectId !== anchor.projectId)
    throw new Error("Keyword project changed.");
  const depth = resolveEffectiveSerpDepth({
    projectDepth: keyword.project.defaults?.serpDepth,
    requestedDepth: input.depth,
    checkScheduleDepth: keyword.checkSchedule?.serpDepth,
    scheduleDepth: keyword.schedule?.serpDepth,
  });
  const native = connection
    ? await loadNativeRankRequestCosts(db, connection, [{ keyword: keyword.text, depth }])
    : undefined;
  if (native && native[0] == null) throw new ProviderQuoteUnavailableError();
  const loaded = native
    ? null
    : connection
      ? await loadProviderRateContext(connection.id, "rank_check", new Date(), db)
      : LIST_PROVIDER_RATE_CONTEXT;
  const context =
    connection?.credentialSource === "hosted" && loaded
      ? { ...loaded, manualAmountCents: null }
      : loaded;
  return {
    allocationConnection: connection
      ? {
          credentialSource: connection.credentialSource,
          id: connection.id,
          provider: connection.provider,
        }
      : null,
    estimatedCostCents: native
      ? native[0]
      : estimatedRankCheckCostCents(
          connection?.provider,
          depth,
          context?.manualAmountCents,
          context ?? LIST_PROVIDER_RATE_CONTEXT,
        ),
    depth,
    projectId: anchor.projectId,
    keywordPublicId: keyword.publicId,
  };
}
