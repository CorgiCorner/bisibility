import "server-only";
import { listPrompts } from "@/lib/ai-tracking/stores/prompts";
import type { TrackingTransaction } from "@/lib/ai-tracking/stores/shared";
import { listTopics } from "@/lib/ai-tracking/stores/topics";
import { prisma } from "@/lib/db/prisma";
import { activeKeywordWhere } from "@/lib/queries/keyword-active";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { researchKeywords } from "./prompt-research-projection";

export async function researchProjectState(
  projectId: string,
  database: Pick<TrackingTransaction, "project" | "aiTopic" | "aiPrompt" | "keyword"> = prisma,
) {
  const [project, topics, prompts, keywords] = await Promise.all([
    database.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true, domain: true, lookupCacheTtlSeconds: true },
    }),
    listTopics(projectId, database),
    listPrompts(projectId, database),
    database.keyword.findMany({
      where: { projectId, ...activeKeywordWhere },
      select: { text: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const currentTopics = topics.filter((topic) => !topic.archivedAt);
  return {
    domain: trackedProjectDomain(project.domain) ?? "",
    brand: project.name,
    lookupCacheTtlSeconds: project.lookupCacheTtlSeconds,
    tracked: prompts
      .filter((prompt) => !prompt.archivedAt)
      .map((prompt) => prompt.revisions[0]?.text ?? ""),
    keywords: researchKeywords(
      currentTopics.map((topic) => topic.name),
      keywords.map((keyword) => keyword.text),
    ),
    topics: currentTopics.map((topic) => ({
      id: topic.publicId,
      name: topic.name,
      description: topic.description,
      status: topic.pausedAt ? ("paused" as const) : ("active" as const),
    })),
  };
}
