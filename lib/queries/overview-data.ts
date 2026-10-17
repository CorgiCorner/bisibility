import { REPORT_READ_TRANSACTION } from "@/lib/rank-reports/read-transaction";
import "server-only";

import { localOverviewKeywordWhere } from "@/lib/dashboard-local/overview-scope";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { monthStartUtc } from "@/lib/metering/utc-window";
import { targetReportBaseline } from "@/lib/rank-reports/policy";
import { supportsResearchScope } from "@/lib/serp/research-capability";
import {
  normalizeOverviewFilters,
  type OverviewFilters,
  overviewCheckStart,
} from "./overview-filters";
import { overviewMarketHistoryStart } from "./overview-markets";
import { readOverviewMeasurements } from "./overview-measurement-read";
import { loadRankTrackerMetadataBatches } from "./rank-tracker-metadata-batches";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";
import { createSessionRankTrackerReportOptions } from "./rank-tracker-session-report";

function nextMonthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function loadOverviewMetricData(
  projectId: string,
  input: Partial<OverviewFilters> = {},
  now = new Date(),
  options: {
    includeMarkets?: boolean;
    keywordIds?: readonly string[];
    tx?: Prisma.TransactionClient;
    report?: RankTrackerReportOptions;
  } = {},
) {
  const filters = normalizeOverviewFilters(input);
  const report =
    options.report ??
    (await createSessionRankTrackerReportOptions(
      now,
      { "7d": 7, "28d": 28, "90d": 90 }[filters.range],
    ));
  const read = async (tx: Prisma.TransactionClient) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, publicId: true },
    });
    if (!project) throw new Error("Overview project is unavailable.");
    const where = localOverviewKeywordWhere(projectId, filters, options.keywordIds);
    const historyStart = new Date(
      Math.min(
        overviewCheckStart(now, filters.range).getTime(),
        overviewMarketHistoryStart(now, filters.range).getTime(),
      ),
    );
    const [
      projectDefaults,
      selectedKeywords,
      projectMarkets,
      filteredKeywordCount,
      addedThisMonth,
      latestCheck,
    ] = await Promise.all([
      tx.projectDefaults.findUnique({
        select: {
          cronExpression: true,
          frequency: true,
          jitterMinutes: true,
          nextCheckAt: true,
          timezone: true,
        },
        where: { projectId },
      }),
      readOverviewMeasurements(where, historyStart, now, tx),
      options.includeMarkets
        ? tx.projectMarket.findMany({
            orderBy: [{ location: { displayName: "asc" } }, { location: { languageLabel: "asc" } }],
            select: {
              locationId: true,
              location: {
                select: {
                  countryCode: true,
                  displayName: true,
                  languageCode: true,
                  languageLabel: true,
                },
              },
            },
            where: { projectId, status: "active" },
          })
        : Promise.resolve([]),
      tx.keyword.count({ where }),
      tx.keyword.count({
        where: {
          ...where,
          createdAt: { gte: monthStartUtc(now), lt: nextMonthStartUtc(now) },
        },
      }),
      tx.rankCheck.findFirst({
        orderBy: { checkedAt: "desc" },
        select: { checkedAt: true, provider: true },
        where: {
          keyword: options.keywordIds === undefined ? { projectId } : where,
          ...(options.keywordIds === undefined ? {} : { createdAt: { lte: now } }),
          status: "completed",
        },
      }),
    ]);

    // Execution pause stops new work; active-market membership retains its observed targets.
    const eligible = selectedKeywords;
    const metadata = await loadRankTrackerMetadataBatches(
      report.loadMetadata,
      tx,
      project,
      eligible,
      now,
    );
    return {
      projectDefaults,
      selectedKeywords,
      projectMarkets,
      filteredKeywordCount,
      addedThisMonth,
      latestCheck,
      metadata,
      where,
    };
  };
  const {
    projectDefaults,
    selectedKeywords,
    projectMarkets,
    filteredKeywordCount,
    addedThisMonth,
    latestCheck,
    metadata,
    where,
  } = options.tx
    ? await read(options.tx)
    : await prisma.$transaction(read, REPORT_READ_TRANSACTION);
  // Pure display projection runs after our owned transaction releases its connection.
  const eligible = selectedKeywords;
  const policy = report.policyAt(now);
  const keywords = eligible.map((keyword) => {
    const captured = metadata.get(keyword.publicId);
    return {
      ...keyword,
      measurementPolicy: {
        asOf: new Date(now.getTime()),
        ...targetReportBaseline({ baselineWindow: captured?.baselineWindow ?? null }, policy),
        expectedScope: captured?.expectedScope ?? null,
        freshForMs: captured?.freshForMs ?? null,
        requireCurrentScope: true,
      },
    };
  });
  const keywordVolumes = new Map(
    keywords.map((keyword) => [keyword.id, metadata.get(keyword.publicId)?.volume ?? null]),
  );

  return {
    addedThisMonth,
    filteredKeywordCount,
    eligibleTargetCount: keywords.length,
    filters,
    keywordVolumes,
    keywords,
    latestCheck,
    marketKeywords: options.includeMarkets ? keywords : [],
    projectMarkets: projectMarkets
      .filter(
        (market) =>
          options.keywordIds === undefined ||
          selectedKeywords.some((keyword) => keyword.locationId === market.locationId),
      )
      .map((market) => ({
        ...market,
        researchAvailable: supportsResearchScope(
          market.location.countryCode,
          market.location.languageCode,
        ),
      })),
    projectDefaults,
    where,
  };
}
