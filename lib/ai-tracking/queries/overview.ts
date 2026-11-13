import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";
import {
  AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
  type AiVisibilityOverviewLoad,
  marketFromParameters,
  type OverviewAnswerInput,
  type OverviewEntityInput,
  type OverviewFilters,
  type OverviewMarketOption,
  overviewFiltersFromQuery,
  overviewPeriodStart,
  type ParsedMarket,
  parseUsdMicros,
  recordOf,
} from "@/lib/ai-tracking/overview-model";
import { projectAiVisibilityOverview } from "@/lib/ai-tracking/overview-projection";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { serpLanguageCatalog } from "@/lib/serp/generated/serp-language-catalog";

const answerSelect = {
  answerText: true,
  citations: { select: { url: true } },
  engine: true,
  finishedAt: true,
  id: true,
  plan: true,
  promptRevision: { select: { text: true } },
  receipt: true,
} satisfies Prisma.AiTrackingSampleSelect;

const facetSelect = { engine: true, plan: true } satisfies Prisma.AiTrackingSampleSelect;

export async function loadAiVisibilityOverview(input: {
  canAddCompetitor: boolean;
  now: Date;
  projectId: string;
  query: AiVisibilityQuery;
  timeZone: string;
}): Promise<AiVisibilityOverviewLoad> {
  const filters = overviewFiltersFromQuery(input.query);
  const from = overviewPeriodStart(filters.period, input.now);
  const where = overviewAnswerWhere(input.projectId, filters, from);
  const [project, competitors, topics, answers, facets, anyAnswer] = await Promise.all([
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
  ]);
  if (!project) throw new Error("Project not found.");
  const truncated = answers.length > AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT;
  const kept = truncated ? answers.slice(0, AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT) : answers;
  const entities: OverviewEntityInput[] = [
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
  const markets = overviewMarketOptions(facets.map((row) => row.plan));
  const engines = [...new Set(facets.map((row) => row.engine))].sort();
  return {
    canAddCompetitor: input.canAddCompetitor,
    engines:
      filters.engine && !engines.includes(filters.engine)
        ? [...engines, filters.engine].sort()
        : engines,
    filters,
    hasAnswers: Boolean(anyAnswer),
    markets: filters.market ? overviewMarketsWithSelection(markets, filters.market) : markets,
    overview: projectAiVisibilityOverview({
      answers: kept.flatMap((row) => overviewAnswerFromSample(row) ?? []),
      entities,
      promptKind: filters.promptKind,
      timeZone: input.timeZone,
      truncated,
    }),
    topics: topics.map((topic) => ({ id: topic.publicId, name: topic.name })),
    windowFrom: from?.toISOString() ?? null,
  };
}

export function overviewAnswerWhere(
  projectId: string,
  filters: OverviewFilters,
  from: Date | null,
): Prisma.AiTrackingSampleWhereInput {
  return {
    answerText: { not: null },
    measurement: "answer_present",
    projectId,
    ...(filters.engine ? { engine: filters.engine } : {}),
    ...(from ? { finishedAt: { gte: from } } : {}),
    ...(filters.topic
      ? { promptRevision: { prompt: { topic: { publicId: filters.topic } } } }
      : {}),
    ...marketWhere(filters.market),
  };
}

function marketWhere(market: ParsedMarket | null): Prisma.AiTrackingSampleWhereInput {
  if (!market) return {};
  const location =
    market.kind === "name"
      ? { equals: market.location, path: ["requestedParameters", "location_name"] }
      : { equals: market.code, path: ["requestedParameters", "location_code"] };
  if (!market.language) return { plan: location };
  return {
    AND: [
      { plan: location },
      { plan: { equals: market.language, path: ["requestedParameters", "language_code"] } },
    ],
  };
}

export function overviewAnswerFromSample(row: {
  answerText: string | null;
  citations: readonly { url: string }[];
  engine: string;
  finishedAt: Date | null;
  id: string;
  plan: unknown;
  promptRevision: { text: string } | null;
  receipt: unknown;
}): OverviewAnswerInput | null {
  if (typeof row.answerText !== "string") return null;
  const plan = recordOf(row.plan);
  const receipt = recordOf(row.receipt);
  const amount = receipt && typeof receipt.amountUsd === "string" ? receipt.amountUsd : null;
  return {
    answerText: row.answerText,
    citations: row.citations,
    costMicros: amount === null ? null : parseUsdMicros(amount),
    engine: row.engine,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    id: row.id,
    promptText: row.promptRevision?.text ?? "",
    provider: plan && typeof plan.provider === "string" ? plan.provider : null,
  };
}

function languageLabel(code: string) {
  return serpLanguageCatalog.find((language) => language.code === code)?.label ?? code;
}

export function overviewMarketOptions(plans: readonly unknown[]): OverviewMarketOption[] {
  const markets = new Map<string, OverviewMarketOption>();
  for (const plan of plans) {
    const parameters = recordOf(plan)?.requestedParameters;
    const market = marketFromParameters(parameters, languageLabel);
    if (market) markets.set(market.key, market);
  }
  return [...markets.values()].sort((left, right) => left.label.localeCompare(right.label, "en"));
}

export function overviewMarketsWithSelection(
  markets: readonly OverviewMarketOption[],
  market: ParsedMarket,
) {
  const key =
    market.kind === "name"
      ? marketFromParameters(
          { language_code: market.language, location_name: market.location },
          languageLabel,
        )
      : marketFromParameters(
          { language_code: market.language, location_code: market.code },
          languageLabel,
        );
  if (!key || markets.some((item) => item.key === key.key)) return markets;
  return [...markets, key].sort((left, right) => left.label.localeCompare(right.label, "en"));
}
