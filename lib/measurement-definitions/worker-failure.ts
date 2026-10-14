import "server-only";
import { prisma } from "@/lib/db/prisma";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/constants";
import { definitionSourceSchema } from "./schema";
/** Original admission intent for failure metadata; not an observation or proof that any provider saw this request. */
export async function retainedDefinitionFailureIntent(
  projectId: string,
  keywordId: string,
  rankCheckId?: string,
) {
  if (!rankCheckId) return null;
  const [row] = await prisma.$queryRaw<
    Array<{ intent: unknown }>
  >`SELECT i."definitionIntent" AS intent FROM rank_check_run_items i
    JOIN rank_check_runs r ON r.id=i."runId" JOIN rank_checks c ON c.id=i."rankCheckId" AND c."runId"=r.id AND c."keywordId"=i."keywordId"
    WHERE r."projectId"=${projectId} AND i."keywordId"=${keywordId} AND c.id=${rankCheckId}`;
  const intent = row?.intent as { version?: unknown; depth?: unknown; source?: unknown } | null;
  const source = definitionSourceSchema.safeParse(intent?.source);
  if (
    intent?.version !== 1 ||
    !source.success ||
    source.data.projectId !== projectId ||
    source.data.keywordId !== keywordId ||
    !serpDepthValues.includes(intent.depth as SerpDepth)
  )
    return null;
  return {
    keyword: source.data.target.text,
    domain: trackedProjectDomain(source.data.target.domain) ?? "",
    targetUrl: source.data.target.targetUrl,
    depth: intent.depth as SerpDepth,
  };
}
