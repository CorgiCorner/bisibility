import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";
import {
  AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
  overviewFiltersFromQuery,
  overviewPeriodStart,
} from "@/lib/ai-tracking/overview-model";
import {
  type AiVisibilitySourcesLoad,
  projectAiVisibilitySources,
} from "@/lib/ai-tracking/sources-model";
import { prisma } from "@/lib/db/prisma";
import {
  overviewAnswerFromSample,
  overviewAnswerWhere,
  overviewMarketOptions,
  overviewMarketsWithSelection,
} from "./overview";

const answerSelect = {
  answerText: true,
  citations: { select: { url: true } },
  engine: true,
  finishedAt: true,
  id: true,
  plan: true,
  promptRevision: { select: { text: true } },
  receipt: true,
} as const;

const facetSelect = { engine: true, plan: true } as const;

export async function loadAiVisibilitySources(input: {
  canWrite: boolean;
  now: Date;
  projectId: string;
  query: AiVisibilityQuery;
}): Promise<AiVisibilitySourcesLoad> {
  const filters = overviewFiltersFromQuery(input.query);
  const from = overviewPeriodStart(filters.period, input.now);
  const where = overviewAnswerWhere(input.projectId, filters, from);
  const [project, competitors, topics, answers, facets, anyAnswer, overrides, plan] =
    await Promise.all([
      prisma.project.findUnique({
        select: {
          brandAliases: true,
          brandExcludedNames: true,
          domain: true,
          name: true,
        },
        where: { id: input.projectId },
      }),
      prisma.competitor.findMany({
        orderBy: { domain: "asc" },
        select: { domain: true },
        where: { projectId: input.projectId },
      }),
      prisma.aiTopic.findMany({
        orderBy: { name: "asc" },
        select: { name: true, publicId: true },
        take: 30,
        where: { archivedAt: null, projectId: input.projectId },
      }),
      prisma.aiTrackingSample.findMany({
        orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
        select: answerSelect,
        take: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT + 1,
        where,
      }),
      prisma.aiTrackingSample.findMany({
        orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
        select: facetSelect,
        take: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
        where: overviewAnswerWhere(
          input.projectId,
          { ...filters, engine: null, market: null, topic: null },
          from,
        ),
      }),
      prisma.aiTrackingSample.findFirst({
        select: { id: true },
        where: {
          answerText: { not: null },
          measurement: "answer_present",
          projectId: input.projectId,
        },
      }),
      prisma.aiSourceTypeOverride.findMany({
        select: { domain: true, type: true },
        where: { projectId: input.projectId },
      }),
      prisma.aiSourcePlanItem.findMany({
        orderBy: { domain: "asc" },
        select: { domain: true, note: true, state: true, url: true },
        where: { projectId: input.projectId },
      }),
    ]);
  if (!project) throw new Error("Project not found.");
  const truncated = answers.length > AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT;
  const kept = truncated ? answers.slice(0, AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT) : answers;
  const markets = overviewMarketOptions(facets.map((row) => row.plan));
  const engines = [...new Set(facets.map((row) => row.engine))].sort();
  return {
    canWrite: input.canWrite,
    engines:
      filters.engine && !engines.includes(filters.engine)
        ? [...engines, filters.engine].sort()
        : engines,
    filters,
    hasAnswers: Boolean(anyAnswer),
    markets: filters.market ? overviewMarketsWithSelection(markets, filters.market) : markets,
    sources: projectAiVisibilitySources({
      answers: kept.flatMap((row) => overviewAnswerFromSample(row) ?? []),
      competitors,
      overrides,
      own: {
        aliases: project.brandAliases ?? [],
        domain: project.domain,
        excludedNames: project.brandExcludedNames ?? [],
        label: project.name,
      },
      plan,
      promptKind: filters.promptKind,
      truncated,
    }),
    topics: topics.map((topic) => ({ id: topic.publicId, name: topic.name })),
  };
}
