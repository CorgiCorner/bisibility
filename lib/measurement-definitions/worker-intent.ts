import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { SerpDepth } from "@/lib/serp/constants";
import { serpDepthValues } from "@/lib/serp/constants";
import { frozenRequest, sameDefinitionBytes } from "./canonical";
import { DefinitionConflictError, DefinitionUnavailableError } from "./errors";
import type { DefinitionBinding, DefinitionTransaction } from "./model";
import { definitionSourceSchema } from "./schema";
import { lockDefinitionSource, readDefinitionSource } from "./storage";

/** Trusted admission transaction only: no read/page mount initializes intent or a policy. */
export async function captureDefinitionItemIntent(
  tx: DefinitionTransaction,
  projectId: string,
  keywordId: string,
  depth: SerpDepth,
): Promise<Prisma.InputJsonValue> {
  await lockDefinitionSource(tx, projectId, keywordId);
  return {
    version: 1,
    depth,
    source: await readDefinitionSource(tx, projectId, keywordId),
  } as unknown as Prisma.InputJsonValue;
}
/** Stable ordering under the already locked launch/project transaction. Provider I/O is absent. */
export async function captureDefinitionItemIntents(
  tx: DefinitionTransaction,
  projectId: string,
  items: readonly { keywordId: string; depth: SerpDepth }[],
) {
  const intents = new Map<string, Prisma.InputJsonValue>();
  for (const item of [...items].sort((a, b) => a.keywordId.localeCompare(b.keywordId))) {
    if (intents.has(item.keywordId)) throw new DefinitionUnavailableError();
    intents.set(
      item.keywordId,
      await captureDefinitionItemIntent(tx, projectId, item.keywordId, item.depth),
    );
  }
  return intents;
}
/** No old history/current keyword fallback: original queued intent must still equal this capture. */
export async function assertDefinitionItemIntent(
  tx: DefinitionTransaction,
  runItemId: string,
  binding: DefinitionBinding,
) {
  const [row] = await tx.$queryRaw<
    Array<{ intent: unknown }>
  >`SELECT "definitionIntent" AS intent FROM rank_check_run_items
    WHERE id=${runItemId} AND "runId"=(SELECT "runId" FROM rank_checks WHERE id=${binding.owner.rankCheckId}) AND "keywordId"=${binding.keywordId} AND "rankCheckId"=${binding.owner.rankCheckId}`;
  const intent = row?.intent as { version?: unknown; depth?: unknown; source?: unknown } | null;
  const source = definitionSourceSchema.safeParse(intent?.source);
  if (
    intent?.version !== 1 ||
    !source.success ||
    !serpDepthValues.includes(intent.depth as SerpDepth)
  )
    throw new DefinitionUnavailableError();
  if (
    !sameDefinitionBytes(source.data, binding.source) ||
    !sameDefinitionBytes(
      frozenRequest(source.data, binding.request.providerId, intent.depth as SerpDepth),
      binding.request,
    )
  )
    throw new DefinitionConflictError();
}

export async function readAdmittedDefinitionIntent(
  tx: DefinitionTransaction,
  runItemId: string,
  projectId: string,
  keywordId: string,
) {
  const [row] = await tx.$queryRaw<
    Array<{ intent: unknown }>
  >`SELECT i."definitionIntent" AS intent FROM rank_check_run_items i JOIN rank_check_runs r ON r.id=i."runId"
    WHERE i.id=${runItemId} AND i."keywordId"=${keywordId} AND r."projectId"=${projectId}`;
  const intent = row?.intent as { version?: unknown; depth?: unknown; source?: unknown } | null;
  const source = definitionSourceSchema.safeParse(intent?.source);
  if (
    intent?.version !== 1 ||
    !source.success ||
    !serpDepthValues.includes(intent.depth as SerpDepth) ||
    source.data.projectId !== projectId ||
    source.data.keywordId !== keywordId
  )
    throw new DefinitionUnavailableError();
  return { depth: intent.depth as SerpDepth, source: source.data };
}
