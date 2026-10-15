import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { startProviderComparisonWorkflow } from "@/lib/temporal/provider-comparison-client";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import { assertComparisonAccess } from "./access";
import { ComparisonPreviewRejectedError } from "./errors";
import {
  comparisonDepth,
  comparisonHash,
  comparisonKeyword,
  comparisonPreviewTtlMs,
  parseComparisonSnapshot,
  requestUuid,
} from "./model";
import { quoteComparison } from "./quote";
import { comparisonRunView } from "./read";
import type { ComparisonPreview, ComparisonRun } from "./types";

export { ComparisonPreviewRejectedError } from "./errors";
export { readLatestProviderComparison, readProviderComparison } from "./read";
export { loadComparisonContext } from "./source";
export async function previewProviderComparison(input: {
  projectId: string;
  keywordId: string;
  actorId: string;
}): Promise<ComparisonPreview> {
  const now = new Date();
  return prisma.$transaction(
    async (tx) => {
      await assertComparisonAccess(tx, input.projectId, input.actorId, true);
      const snapshot = await quoteComparison(input.projectId, input.keywordId, now, tx);
      const hash = comparisonHash(snapshot),
        expiresAt = new Date(now.getTime() + comparisonPreviewTtlMs),
        id = randomUUID();
      await tx.providerComparisonPreview.create({
        data: {
          id,
          projectId: input.projectId,
          actorId: input.actorId,
          keywordId: input.keywordId,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          sourceHash: hash,
          expiresAt,
        },
      });
      return {
        id,
        hash,
        expiresAt: expiresAt.toISOString(),
        keyword: comparisonKeyword(snapshot),
        depth: comparisonDepth,
        sides: snapshot.connections.map((side) => side.quote),
      };
    },
    { timeout: 20_000 },
  );
}
export async function launchProviderComparison(input: {
  projectId: string;
  keywordId: string;
  actorId: string;
  previewId: string;
  previewHash: string;
  requestKey: string;
}): Promise<ComparisonRun> {
  requestUuid.parse(input.previewId);
  requestUuid.parse(input.requestKey);
  const row = await prisma.$transaction(
    async (tx) => {
      await assertComparisonAccess(tx, input.projectId, input.actorId, true);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["provider-comparison", input.projectId, input.requestKey])},0))`;
      const existing = await tx.providerComparisonRun.findUnique({
        where: {
          projectId_requestKey: { projectId: input.projectId, requestKey: input.requestKey },
        },
        include: { sides: true },
      });
      if (existing) {
        if (
          existing.actorId !== input.actorId ||
          existing.keywordId !== input.keywordId ||
          existing.previewId !== input.previewId ||
          existing.sourceHash !== input.previewHash
        )
          throw new Error("Comparison request key conflict.");
        return existing;
      }
      const preview = await tx.providerComparisonPreview.findFirst({
        where: { id: input.previewId, projectId: input.projectId, actorId: input.actorId },
      });
      if (
        !preview?.keywordId ||
        preview.keywordId !== input.keywordId ||
        preview.sourceHash !== input.previewHash ||
        preview.expiresAt <= new Date()
      )
        throw new ComparisonPreviewRejectedError();
      const snapshot = parseComparisonSnapshot(preview.snapshot);
      const current = await quoteComparison(
        input.projectId,
        preview.keywordId,
        new Date(),
        tx,
      ).catch(() => {
        throw new ComparisonPreviewRejectedError();
      });
      if (comparisonHash(current) !== preview.sourceHash)
        throw new ComparisonPreviewRejectedError();
      return tx.providerComparisonRun.create({
        data: {
          id: randomUUID(),
          projectId: input.projectId,
          actorId: input.actorId,
          keywordId: preview.keywordId,
          requestKey: input.requestKey,
          previewId: preview.id,
          sourceHash: preview.sourceHash,
          snapshot: preview.snapshot as Prisma.InputJsonValue,
          sides: {
            create: snapshot.connections.map((side) => ({
              id: randomUUID(),
              projectId: input.projectId,
              provider: side.provider,
              connectionId: side.id,
            })),
          },
        },
        include: { sides: true },
      });
    },
    { timeout: 20_000 },
  );
  // The durable row is the outbox. A failed/uncertain wake never buys another comparison.
  await startProviderComparisonWorkflow(input.projectId, row.id).catch(() => undefined);
  void publishWorkerIntent("provider_comparison");
  return comparisonRunView(row);
}
