import "server-only";
import { createHash } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { FrozenWebRequest } from "@/lib/measurement-definitions/model";
import { captureDefinitionItemIntents } from "@/lib/measurement-definitions/worker-intent";
import { quoteDeploymentRankReservations } from "@/lib/providers/execution-extension";
import type { QueuedRankCheckWorkflowInput } from "@/lib/temporal/queued-rank-check-contract";

/** Business ownership for a real legacy dispatcher claim, with NO new paid reservation/hold/journal. */
export async function queuedDefinitionLegacyRun(
  tx: Prisma.TransactionClient,
  input: QueuedRankCheckWorkflowInput & { batchId: string },
  connection: {
    id: string;
    credentialSource: string;
  },
  requests: ReadonlyMap<string, FrozenWebRequest>,
  costs: readonly number[],
  now: Date,
) {
  const claims = input.dispatchClaims;
  if (
    !claims ||
    claims.length !== input.keywordIds.length ||
    new Set(claims.map((claim) => claim.keywordId)).size !== claims.length
  )
    throw new Error("Legacy queue requires its actual dispatcher advancement claims.");
  for (const keywordId of [...input.keywordIds].sort()) {
    const claim = claims.find((entry) => entry.keywordId === keywordId);
    if (
      !claim ||
      !/^\d+$/u.test(claim.stateVersion) ||
      !Number.isFinite(Date.parse(claim.advancedCheckAt)) ||
      !Number.isFinite(Date.parse(claim.dueCheckAt)) ||
      Date.parse(claim.advancedCheckAt) <= Date.parse(claim.dueCheckAt)
    )
      throw new Error("Invalid legacy dispatcher claim.");
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "keywordId" AS id FROM keyword_dispatch_states
      WHERE "keywordId"=${keywordId} AND "nextCheckAt"=${new Date(claim.advancedCheckAt)} AND xmin::text=${claim.stateVersion} FOR UPDATE`;
    if (rows.length !== 1) throw new Error("Legacy dispatcher claim changed before preparation.");
  }
  const publicId = makePublicId("rcr");
  // Quote-only existing host policy. Native paid admission remains the original queued transport owner.
  const quote =
    connection.credentialSource === "hosted"
      ? await quoteDeploymentRankReservations(tx, {
          connectionId: connection.id,
          projectId: input.projectId,
          source: "app",
          items: input.keywordIds.map((keywordId, index) => ({
            keywordId,
            estimatedCostCents: costs[index].toFixed(4),
            estimatedQuantity: "1.000000",
          })),
        })
      : null;
  if (connection.credentialSource === "hosted" && !quote)
    throw new Error("Original queued hosted quote is unavailable.");
  const definitionIntents = await captureDefinitionItemIntents(
    tx,
    input.projectId,
    input.keywordIds.map((keywordId) => {
      const request = requests.get(keywordId);
      if (!request) throw new Error("Original queued request is unavailable.");
      return { keywordId, depth: request.depth };
    }),
  );
  const run = await tx.rankCheckRun.create({
    data: {
      projectId: input.projectId,
      publicId,
      source: "app",
      trigger: "scheduled",
      status: "running",
      startedAt: now,
      requestedCount: input.keywordIds.length,
      totalCount: input.keywordIds.length,
      keywordCount: input.keywordIds.length,
      targetCount: input.keywordIds.length,
      estimatedCostCents: Math.ceil(costs.reduce((sum, cost) => sum + cost, 0)),
      selectionKind: "legacy_schedule",
      selectionHash: createHash("sha256")
        .update(JSON.stringify([...input.keywordIds].sort()))
        .digest("hex"),
      selectionSpec: {
        v: 1,
        kind: "legacy_schedule",
        queuedDefinitionBatchId: input.batchId,
        dispatchClaims: claims,
        providerConnectionId: connection.id,
        ...(quote ? { rankReservationPrices: quote.prices } : {}),
        capturedKeywords: [...requests.keys()],
      },
      items: {
        create: input.keywordIds.map((keywordId) => ({
          keywordId,
          definitionIntent: definitionIntents.get(keywordId),
          status: "running",
          startedAt: now,
        })),
      },
    },
    select: {
      id: true,
      items: {
        select: {
          id: true,
          keywordId: true,
          runId: true,
          claimAttempts: true,
          claimExpiresAt: true,
        },
      },
    },
  });
  return { runId: run.id, byKeyword: new Map(run.items.map((item) => [item.keywordId, item])) };
}
