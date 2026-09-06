#!/usr/bin/env -S node --experimental-transform-types

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { prisma } from "@/lib/db/prisma";
import {
  refreshReadyWindowFacts,
  type WindowFactsRefreshImport,
} from "@/lib/search-insights/sync/window-facts-refresh";

type WindowFactsBackfillImport = WindowFactsRefreshImport & { activeProperty: string | null };
type WindowFactsBackfillStore = {
  listImports: () => Promise<WindowFactsBackfillImport[]>;
  refresh: (
    input: WindowFactsRefreshImport,
  ) => ReturnType<typeof refreshReadyWindowFacts>;
};

export type WindowFactsBackfillResult = {
  eligible: number;
  failed: number;
  refreshed: number;
  skipped: number;
  written: number;
};

export function parseWindowFactsBackfillOptions(args: string[] = process.argv.slice(2)) {
  const parsed = parseArgs({
    args,
    options: { "dry-run": { type: "boolean" } },
    strict: true,
  });
  return { dryRun: parsed.values["dry-run"] ?? false };
}

export async function backfillCurrentWindowFacts(
  store: WindowFactsBackfillStore,
  options: { dryRun?: boolean } = {},
): Promise<WindowFactsBackfillResult> {
  const result: WindowFactsBackfillResult = {
    eligible: 0,
    failed: 0,
    refreshed: 0,
    skipped: 0,
    written: 0,
  };
  for (const importRow of await store.listImports()) {
    if (importRow.activeProperty !== importRow.property) {
      result.skipped += 1;
      continue;
    }
    result.eligible += 1;
    if (options.dryRun) continue;
    try {
      const refresh = await store.refresh(importRow);
      result.refreshed += 1;
      result.failed += refresh?.failed.length ?? 0;
      result.written += refresh?.written.length ?? 0;
    } catch (error) {
      result.failed += 1;
      console.error("[search-insights] window facts backfill failed", {
        error,
        importId: importRow.id,
        projectId: importRow.projectId,
      });
    }
  }
  return result;
}

async function listImports(): Promise<WindowFactsBackfillImport[]> {
  const rows = await prisma.searchAnalyticsImport.findMany({
    select: {
      daysTotal: true,
      earliestTargetDate: true,
      id: true,
      lastProbeAt: true,
      newestFinalizedDate: true,
      plannedRetentionMonths: true,
      project: {
        select: {
          searchInsightsPropertyRegistry: {
            select: { propertyKey: true },
            where: { status: "active" },
          },
        },
      },
      projectId: true,
      property: true,
    },
    where: {
      newestFinalizedDate: { not: null },
      source: "gsc",
      state: { in: ["completed", "running"] },
    },
  });
  return rows.map(({ project, ...importRow }) => ({
    ...importRow,
    activeProperty: project.searchInsightsPropertyRegistry.at(0)?.propertyKey ?? null,
  }));
}

async function main() {
  const options = parseWindowFactsBackfillOptions();
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required.");
  try {
    const result = await backfillCurrentWindowFacts(
      { listImports, refresh: refreshReadyWindowFacts },
      options,
    );
    console.log(
      `${options.dryRun ? "Dry run" : "Backfill"}: eligible=${result.eligible} refreshed=${result.refreshed} written=${result.written} failed=${result.failed} skipped=${result.skipped}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
