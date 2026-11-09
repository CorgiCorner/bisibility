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
import type { PlaygroundSource } from "./playground-model";
import { quotePlaygroundComparison } from "./playground-quote";
import { comparisonRunView } from "./read";
import type { ComparisonPreview } from "./types";

export async function previewPlaygroundComparison(input: {
  projectId: string;
  actorId: string;
  search: PlaygroundSource;
}): Promise<ComparisonPreview> {
  return prisma.$transaction(
    async (tx) => {
      await assertComparisonAccess(tx, input.projectId, input.actorId, true);
      const snapshot = await quotePlaygroundComparison(
        input.projectId,
        input.search,
        new Date(),
        tx,
      );
      const id = randomUUID(),
        hash = comparisonHash(snapshot),
        expiresAt = new Date(Date.now() + comparisonPreviewTtlMs);
      await tx.providerComparisonPreview.create({
        data: {
          id,
          projectId: input.projectId,
          actorId: input.actorId,
          keywordId: null,
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
        depth: snapshot.depth ?? comparisonDepth,
        sides: snapshot.connections.map((side) => side.quote),
      };
    },
    { timeout: 20_000 },
  );
}

export async function launchPlaygroundComparison(
  input: {
    projectId: string;
    actorId: string;
    previewId: string;
    previewHash: string;
    requestKey: string;
  },
  onCommitted?: () => void,
) {
  let created = false;
  requestUuid.parse(input.requestKey);
  requestUuid.parse(input.previewId);
  const row = await prisma.$transaction(
    async (tx) => {
      await assertComparisonAccess(tx, input.projectId, input.actorId, true);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["provider-comparison", input.projectId, input.requestKey])},0))::text`;
      const existing = await tx.providerComparisonRun.findUnique({
        where: {
          projectId_requestKey: { projectId: input.projectId, requestKey: input.requestKey },
        },
        include: { sides: true },
      });
      if (existing) {
        if (
          existing.actorId !== input.actorId ||
          existing.keywordId !== null ||
          existing.previewId !== input.previewId ||
          existing.sourceHash !== input.previewHash ||
          parseComparisonSnapshot(existing.snapshot).version !== 2
        )
          throw new ComparisonPreviewRejectedError();
        return existing;
      }
      const preview = await tx.providerComparisonPreview.findFirst({
        where: { id: input.previewId, projectId: input.projectId, actorId: input.actorId },
      });
      if (
        !preview ||
        preview.keywordId !== null ||
        preview.sourceHash !== input.previewHash ||
        preview.expiresAt <= new Date()
      )
        throw new ComparisonPreviewRejectedError();
      const snapshot = parseComparisonSnapshot(preview.snapshot);
      if (snapshot.version !== 2) throw new ComparisonPreviewRejectedError();
      const current = await quotePlaygroundComparison(
        input.projectId,
        {
          depth: snapshot.depth,
          query: snapshot.text,
          device: snapshot.device,
          locationId: snapshot.locationId,
          providers: snapshot.connections.map((side) => side.provider),
        },
        new Date(),
        tx,
      );
      if (comparisonHash(current) !== preview.sourceHash)
        throw new ComparisonPreviewRejectedError();
      const createdRun = await tx.providerComparisonRun.create({
        data: {
          id: randomUUID(),
          projectId: input.projectId,
          actorId: input.actorId,
          keywordId: null,
          requestKey: input.requestKey,
          previewId: preview.id,
          sourceHash: preview.sourceHash,
          snapshot: preview.snapshot as Prisma.InputJsonValue,
          sides: {
            create: snapshot.connections.map((side) => ({
              id: randomUUID(),
              provider: side.provider,
              connectionId: side.id,
            })),
          },
        },
        include: { sides: true },
      });
      created = true;
      return createdRun;
    },
    { timeout: 20_000 },
  );
  if (created) onCommitted?.();
  await startProviderComparisonWorkflow(input.projectId, row.id).catch(() => undefined);
  void publishWorkerIntent("provider_comparison");
  return comparisonRunView(row);
}
