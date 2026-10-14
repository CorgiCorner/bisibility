import "server-only";
import { prisma } from "@/lib/db/prisma";
import { MAX_PROJECT_MARKETS } from "@/lib/markets/limits";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import { listArchivedProjectMarkets } from "@/lib/markets/registry";
import { type MarketScheduleContext, marketScheduleContext } from "@/lib/markets/schedule-context";
import { rankCheckRateSelection } from "@/lib/provider-rates/manual-rate";
import { supportsResearchScope } from "@/lib/serp/research-capability";
import { requireReadableProject } from "./_auth";
import { readLegacyOverviewQuality } from "./legacy-overview-quality";
import { type MarketCostKeyword, marketMonthlyCostCents } from "./project-market-cost";
import { legacyMarketTopThree } from "./project-market-quality";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

export type ProjectMarketsView = {
  /**
   * What creating a market needs from the project: its registry (every market, archived ones
   * included, by selection key, so a duplicate is named before the server refuses it), the
   * schedules a new market can join, and the markets it can copy from. Places are not listed
   * here: the definition block reads the bundled catalogs and the location search.
   */
  marketCreation?: {
    scheduleContext?: MarketScheduleContext;
    registry: {
      canonicalKey: string;
      id: string;
      status: "active" | "archived";
    }[];
    schedules: { frequency: string; id: string; name: string }[];
    sources: { id: string; keywordCount: number; name: string }[];
  };
  markets: ({
    canonicalKey: string;
    countryCode: string;
    displayName: string;
    id: string;
    languageCode: string;
    languageLabel: string;
    monthlyCostCents: number | null;
    researchAvailable: boolean;
    status: "active" | "paused";
  } & Partial<MarketsPageRow>)[];
  maxMarkets: number;
  monthlyCostCents: number | null;
  perMarketChecks: number;
  projectId: string;
};

export async function getProjectMarkets(
  projectRef: string,
  options: { now?: Date; report?: RankTrackerReportOptions } = {},
): Promise<ProjectMarketsView> {
  const scope = await requireReadableProject(projectRef);
  const { project } = scope;
  const now = options.now ?? new Date();
  return prisma.$transaction(
    async (tx) => {
      const [data, registry] = await Promise.all([
        tx.project.findUnique({
          include: {
            checkSchedules: {
              where: { archivedAt: null },
              orderBy: [{ isDefault: "desc" }, { name: "asc" }, { publicId: "asc" }],
              select: {
                enabled: true,
                frequency: true,
                isDefault: true,
                name: true,
                publicId: true,
              },
            },
            defaults: true,
            keywords: {
              select: {
                id: true,
                publicId: true,
                createdAt: true,
                archivedAt: true,
                device: true,
                locationId: true,
                schedule: {
                  select: { cronExpression: true, frequency: true, serpDepth: true },
                },
                text: true,
              },
            },
            markets: {
              include: { location: true },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              where: { status: { in: ["active", "paused"] } },
            },
            providerConnections: { include: { rates: rankCheckRateSelection } },
          },
          where: { id: project.id },
        }),
        tx.projectMarket.findMany({
          include: { location: { select: { canonicalKey: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          where: { projectId: project.id },
        }),
      ]);
      if (!data) throw new Error("Project not found.");

      const quality = await readLegacyOverviewQuality(
        tx,
        scope,
        data.keywords.filter(
          (keyword) =>
            keyword.archivedAt === null &&
            data.markets.some((market) => market.locationId === keyword.locationId),
        ),
        { now, horizon: 3, report: options.report },
      );

      const markets: ProjectMarketsView["markets"] = data.markets.map((market) => {
        const marketKeywords = data.keywords.filter(
          (keyword) => keyword.locationId === market.locationId,
        );
        const activeKeywords = marketKeywords.filter((keyword) => keyword.archivedAt === null);
        const rollup = legacyMarketTopThree(
          activeKeywords.map((keyword) => keyword.publicId),
          quality.resolutions,
        );
        return {
          activeKeywordCount: activeKeywords.length,
          canonicalKey: market.location.canonicalKey,
          countryCode: market.location.countryCode,
          currentVisibility: rollup.currentVisibility,
          displayName: market.location.displayName,
          futureKeywordDevices: market.futureKeywordDevices,
          id: market.publicId,
          keywordCount: marketKeywords.length,
          languageCode: market.location.languageCode,
          languageLabel: market.location.languageLabel,
          locationId: market.locationId,
          monthlyCostCents: marketMonthlyCostCents(activeKeywords, data),
          name: market.name,
          researchAvailable: supportsResearchScope(
            market.location.countryCode,
            market.location.languageCode,
          ),
          status: market.status === "active" ? "active" : "paused",
          topThreeCount: rollup.topThreeCount,
        };
      });
      const monthlyCosts = markets
        .filter((market) => market.status === "active")
        .map((market) => market.monthlyCostCents);
      const monthlyCostCents = monthlyCosts.some((cost) => cost == null)
        ? null
        : monthlyCosts.reduce<number>((total, cost) => total + (cost ?? 0), 0);
      const perMarketChecks = Math.max(
        0,
        ...markets.map((market) => market.activeKeywordCount ?? 0),
      );

      return {
        marketCreation: {
          scheduleContext: marketScheduleContext({
            ...data,
            checkSchedules: data.checkSchedules ?? [],
          }),
          registry: registry.map((market) => ({
            canonicalKey: market.location.canonicalKey,
            id: market.publicId,
            status: market.status === "removed" ? "archived" : "active",
          })),
          schedules: (data.checkSchedules ?? [])
            .filter((schedule) => schedule.enabled)
            .map((schedule) => ({
              frequency: schedule.frequency,
              id: schedule.publicId,
              name: schedule.name,
            })),
          sources: markets
            .filter((market) => market.status === "active")
            .map((market) => ({
              id: market.id,
              keywordCount: market.keywordCount ?? 0,
              name: market.name ?? "Unnamed market",
            })),
        },
        markets,
        maxMarkets: MAX_PROJECT_MARKETS,
        monthlyCostCents,
        perMarketChecks,
        projectId: data.publicId,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/** A market as a chrome surface offers it: the name the reader knows, and its URL ref. */
export type ProjectMarketOption = { label: string; ref: string };

/**
 * The visible markets of a project and nothing else. The shell renders on every page, so this
 * deliberately does not go through `getProjectMarkets`, which also prices the project. The label
 * is the one the markets settings page uses, because the language is what keeps `Belgium / Dutch`
 * apart from `Belgium / French`.
 */
export async function listProjectMarketOptions(projectRef: string): Promise<ProjectMarketOption[]> {
  const { project } = await requireReadableProject(projectRef);
  const markets = await prisma.projectMarket.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      location: { select: { displayName: true, languageLabel: true } },
      publicId: true,
    },
    where: { projectId: project.id, status: { in: ["active", "paused"] } },
  });

  return markets.map((market) => ({
    label: `${market.location.displayName} / ${market.location.languageLabel}`,
    ref: market.publicId,
  }));
}

export type ArchivedProjectMarketsView = {
  markets: {
    displayName: string;
    futureKeywordDevices?: ("desktop" | "mobile")[];
    id: string;
    keywordCount: number;
    languageLabel: string;
    locationId?: string;
    monthlyCostCents?: number | null;
    name?: string;
  }[];
  projectId: string;
};

/** Archived markets plus the keywords a restore resumes, so the UI states the cost first. */
export async function getArchivedProjectMarkets(
  projectRef: string,
): Promise<ArchivedProjectMarketsView> {
  const { project } = await requireReadableProject(projectRef);
  const [archived, projectCost] = await Promise.all([
    listArchivedProjectMarkets(project.id),
    prisma.project.findUnique({
      include: {
        defaults: true,
        providerConnections: { include: { rates: rankCheckRateSelection } },
      },
      where: { id: project.id },
    }),
  ]);
  if (!projectCost) throw new Error("Project not found.");
  const keywords = await prisma.keyword.findMany({
    select: {
      locationId: true,
      schedule: { select: { cronExpression: true, frequency: true, serpDepth: true } },
    },
    where: {
      archivedAt: null,
      locationId: { in: archived.map((market) => market.locationId) },
      projectId: project.id,
    },
  });
  const keywordsByLocation = new Map<string, MarketCostKeyword[]>();
  for (const keyword of keywords) {
    const current = keywordsByLocation.get(keyword.locationId) ?? [];
    current.push(keyword);
    keywordsByLocation.set(keyword.locationId, current);
  }

  return {
    markets: archived.map((market) => {
      const marketKeywords = keywordsByLocation.get(market.locationId) ?? [];
      return {
        displayName: market.location.displayName,
        futureKeywordDevices: market.futureKeywordDevices,
        id: market.publicId,
        keywordCount: marketKeywords.length,
        languageLabel: market.location.languageLabel,
        locationId: market.locationId,
        monthlyCostCents: marketMonthlyCostCents(marketKeywords, projectCost),
        name: market.name,
      };
    }),
    projectId: project.publicId,
  };
}
