import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import { AuthorizationError, authorize } from "@/lib/auth/authorize";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import { auditKeywordExport } from "@/lib/keywords/export-audit";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import type { RankReportDatabase } from "@/lib/rank-reports/access";
import { csvRow } from "@/lib/ui/csv";
import { legacyHistoryFromSnapshot } from "./bounded-history";
import type { HistoryExportAuthority } from "./export-authority";
import { historyExportReportOptions } from "./export-host";
import { loadHistoryExportSnapshot } from "./export-snapshot";

export type RankHistoryExportOptions = {
  actor: Actor;
  auditActorId?: string | null;
  authority?: HistoryExportAuthority;
  format: "csv" | "json" | "xlsx";
  granularity: "daily" | "weekly";
  keywordIds?: string[];
  projectId: string;
  range: "30" | "90" | "all";
};
function requiredPublicId(value: string | null, prefix: PublicIdPrefix, resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix)
    throw new Error(`${resource} public ID is not available.`);
  return value;
}
/** The legacy result shape is preserved; every database read is now bounded and authorized. */
export async function loadRankHistoryExport(
  input: RankHistoryExportOptions,
  options: { report?: RankTrackerReportOptions; db?: RankReportDatabase } = {},
) {
  if (input.keywordIds?.some((id) => parsePublicId(id)?.prefix !== "kw"))
    throw new Error("Keyword not found.");
  if (input.authority && input.authority.actor.id !== input.actor.id)
    throw new AuthorizationError("forbidden");
  const context = input.authority ?? { actor: input.actor, transport: "session" as const };
  const snapshot = await loadHistoryExportSnapshot(
    context,
    input,
    options.report ?? historyExportReportOptions(context),
    options.db,
  );
  authorize(input.actor, "read", { projectId: snapshot.project.id, type: "keyword" });
  await auditKeywordExport(
    input.auditActorId === undefined ? input.actor.id : input.auditActorId,
    snapshot.project.id,
    snapshot.project.publicId,
    snapshot.keywords.length,
    input.format,
    "history",
  );
  return legacyHistoryFromSnapshot(snapshot, input);
}

type LoadedRankHistory = Awaited<ReturnType<typeof loadRankHistoryExport>>;

function weekKey(date: Date) {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - yearStart) / 86400000,
  );
  return `${date.getUTCFullYear()}-${Math.floor(day / 7)}`;
}

export function rankHistoryRows(
  loaded: LoadedRankHistory,
  granularity: RankHistoryExportOptions["granularity"],
) {
  const rows = loaded.keywords.flatMap((keyword) => {
    const keywordId = requiredPublicId(keyword.publicId, "kw", "Keyword");
    const weeks = new Set<string>();
    return keyword.rankChecks.flatMap((check) => {
      const id = requiredPublicId(check.publicId, "check", "Rank-check");
      const key = `${keywordId}:${weekKey(check.checkedAt)}`;
      if (granularity === "weekly" && weeks.has(key)) return [];
      weeks.add(key);
      return [
        {
          checkedAt: check.checkedAt,
          id,
          keyword: keyword.text,
          keywordId,
          normalizationVersion: check.normalizationVersion,
          position: check.position,
          previousPosition: check.previousPosition,
          provider: check.provider,
          rankingUrl: check.rankingUrl,
          requestedDepth: check.requestedDepth,
        },
      ];
    });
  });
  return rows.sort(
    (left, right) =>
      right.checkedAt.getTime() - left.checkedAt.getTime() || right.id.localeCompare(left.id),
  );
}

export function rankHistoryCsvLine(row: ReturnType<typeof rankHistoryRows>[number]) {
  return csvRow([
    row.keywordId,
    row.keyword,
    row.checkedAt.toISOString(),
    row.position,
    row.previousPosition,
    row.rankingUrl,
    row.provider,
    row.requestedDepth,
    row.normalizationVersion,
  ]);
}

export const rankHistoryCsvHeader =
  "keyword_id,keyword,checked_at,position,previous_position,ranking_url,provider,requested_depth,normalization_version";
