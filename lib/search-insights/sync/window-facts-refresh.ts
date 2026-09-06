import "server-only";

import { WINDOW_PRESETS } from "@/lib/search-insights/constants";
import { dateKey } from "@/lib/search-insights/dates";
import { readImportObservability } from "@/lib/search-insights/queries/import-observability-db";
import {
  refreshWindowFacts,
  type WindowFactsRefreshResult,
} from "@/lib/search-insights/queries/window-facts-compute";
import type { ImportRow } from "./import-state";

export type WindowFactsRefreshImport = Pick<
  NonNullable<ImportRow>,
  | "daysTotal"
  | "earliestTargetDate"
  | "id"
  | "lastProbeAt"
  | "newestFinalizedDate"
  | "plannedRetentionMonths"
  | "projectId"
  | "property"
>;

function readyWindowDays(input: Awaited<ReturnType<typeof readImportObservability>>) {
  const current = {
    7: input.readyThrough.d7.current,
    28: input.readyThrough.d28.current,
    90: input.readyThrough.d90.current,
  } satisfies Record<number, boolean>;
  return WINDOW_PRESETS.filter(({ days }) => current[days]).map(({ days }) => days);
}

export async function refreshReadyWindowFacts(
  input: WindowFactsRefreshImport,
): Promise<WindowFactsRefreshResult | null> {
  if (!input.newestFinalizedDate) return null;
  const observability = await readImportObservability({
    daysTotal: input.daysTotal,
    earliestTargetDate: input.earliestTargetDate,
    lastProbeAt: input.lastProbeAt,
    newestFinalizedDate: input.newestFinalizedDate,
    plannedRetentionMonths: input.plannedRetentionMonths ?? undefined,
    projectId: input.projectId,
    property: input.property,
  });
  const result = await refreshWindowFacts({
    finalizedThrough: dateKey(input.newestFinalizedDate),
    importId: input.id,
    projectId: input.projectId,
    property: input.property,
    readyWindowDays: readyWindowDays(observability),
  });
  if (result.failed.length > 0) {
    console.error("[search-insights] window facts refresh was partial", {
      failed: result.failed,
      importId: input.id,
      projectId: input.projectId,
    });
  }
  return result;
}
