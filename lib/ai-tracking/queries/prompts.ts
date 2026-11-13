import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";
import { TRACKING_SOURCES, type TrackingSource } from "@/lib/ai-tracking/contract";
import {
  AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
  type OverviewEntityInput,
  overviewFiltersFromQuery,
  overviewPeriodStart,
  recordOf,
} from "@/lib/ai-tracking/overview-model";
import type { PromptAnswerRecord } from "@/lib/ai-tracking/prompts-model";
import {
  overviewAnswerFromSample,
  overviewAnswerWhere,
  overviewMarketOptions,
  overviewMarketsWithSelection,
} from "@/lib/ai-tracking/queries/overview";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

const answerSelect = {
  answerText: true,
  citations: { select: { position: true, title: true, url: true } },
  engine: true,
  finishedAt: true,
  id: true,
  plan: true,
  promptRevision: {
    select: { prompt: { select: { publicId: true } }, publicId: true, text: true },
  },
  publicId: true,
  receipt: true,
  source: true,
} satisfies Prisma.AiTrackingSampleSelect;

export type AiVisibilityPromptAnswers = {
  answers: readonly PromptAnswerRecord[];
  engines: readonly string[];
  entities: readonly OverviewEntityInput[];
  filters: ReturnType<typeof overviewFiltersFromQuery>;
  markets: ReturnType<typeof overviewMarketOptions>;
  truncated: boolean;
};

/** One answer read for every visible prompt. Callers project rows from this batch. */
export async function loadAiVisibilityPromptAnswers(input: {
  now: Date;
  projectId: string;
  query: AiVisibilityQuery;
}): Promise<AiVisibilityPromptAnswers> {
  const filters = overviewFiltersFromQuery(input.query);
  const from = overviewPeriodStart(filters.period, input.now);
  const where = overviewAnswerWhere(input.projectId, filters, from);
  const facetWhere = overviewAnswerWhere(
    input.projectId,
    { ...filters, engine: null, market: null, topic: null },
    from,
  );
  const [project, competitors, answers, facets] = await Promise.all([
    prisma.project.findUnique({
      select: {
        brandAliases: true,
        brandExcludedNames: true,
        domain: true,
        name: true,
        publicId: true,
      },
      where: { id: input.projectId },
    }),
    prisma.competitor.findMany({
      orderBy: { domain: "asc" },
      select: { aliases: true, domain: true, excludedNames: true, label: true, publicId: true },
      where: { projectId: input.projectId },
    }),
    prisma.aiTrackingSample.findMany({
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      select: answerSelect,
      take: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT + 1,
      where,
    }),
    prisma.aiTrackingSample.findMany({
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      select: { engine: true, plan: true },
      take: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
      where: facetWhere,
    }),
  ]);
  if (!project) throw new Error("Project not found.");
  const truncated = answers.length > AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT;
  const kept = truncated ? answers.slice(0, AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT) : answers;
  const engines = [...new Set(facets.map((row) => row.engine))].sort();
  const markets = overviewMarketOptions(facets.map((row) => row.plan));
  return {
    answers: kept.flatMap((row) => promptAnswerFromSample(row) ?? []),
    engines:
      filters.engine && !engines.includes(filters.engine)
        ? [...engines, filters.engine].sort()
        : engines,
    entities: overviewEntities(project, competitors),
    filters,
    markets: [
      ...(filters.market ? overviewMarketsWithSelection(markets, filters.market) : markets),
    ],
    truncated,
  };
}

export function promptAnswerFromSample(row: {
  answerText: string | null;
  citations: readonly { position: number; title: string | null; url: string }[];
  engine: string;
  finishedAt: Date | null;
  id: string;
  plan: unknown;
  promptRevision: { prompt: { publicId: string } | null; publicId: string; text: string } | null;
  publicId: string;
  receipt: unknown;
  source: string;
}): PromptAnswerRecord | null {
  const base = overviewAnswerFromSample({
    ...row,
    promptRevision: row.promptRevision ? { text: row.promptRevision.text } : null,
  });
  const promptId = row.promptRevision?.prompt?.publicId;
  if (!base || !promptId || !row.promptRevision) return null;
  if (!isTrackingSource(row.source)) return null;
  const receipt = recordOf(row.receipt);
  return {
    ...base,
    citations: row.citations,
    costState: receipt && typeof receipt.state === "string" ? receipt.state : "unknown",
    costUsd: receipt && typeof receipt.amountUsd === "string" ? receipt.amountUsd : null,
    id: row.publicId,
    promptId,
    promptRevisionId: row.promptRevision.publicId,
    sampleId: row.publicId,
    source: row.source,
  };
}

function overviewEntities(
  project: {
    brandAliases: string[];
    brandExcludedNames: string[];
    domain: string | null;
    name: string;
    publicId: string;
  },
  competitors: readonly {
    aliases: string[];
    domain: string;
    excludedNames: string[];
    label: string | null;
    publicId: string;
  }[],
): OverviewEntityInput[] {
  return [
    {
      aliases: project.brandAliases ?? [],
      domain: project.domain,
      excludedNames: project.brandExcludedNames ?? [],
      id: project.publicId,
      kind: "project",
      label: project.name,
    },
    ...competitors.map((competitor) => ({
      aliases: competitor.aliases,
      domain: competitor.domain,
      excludedNames: competitor.excludedNames ?? [],
      id: competitor.publicId,
      kind: "competitor" as const,
      label: competitor.label?.trim() || competitor.domain,
    })),
  ];
}

function isTrackingSource(value: string): value is TrackingSource {
  return TRACKING_SOURCES.some((source) => source === value);
}
