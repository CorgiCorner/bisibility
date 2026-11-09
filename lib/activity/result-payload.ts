/** Receipt evidence is deliberately narrower than a successful request. */
export function hasReceivedRankResult(value: unknown, depth = 0): boolean {
  if (depth > 5 || !value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasReceivedRankResult(item, depth + 1));
  const row = value as Record<string, unknown>;
  if (
    row.status === "completed" &&
    "position" in row &&
    (typeof row.checked_at === "string" || typeof row.finishedAt === "string")
  )
    return true;
  const successful = row.latest_successful_check;
  if (
    successful &&
    typeof successful === "object" &&
    "checked_at" in successful &&
    "position" in successful &&
    typeof successful.checked_at === "string"
  )
    return true;
  if (row.hasRankData === true && typeof row.lastCheckAt === "string") return true;
  if (
    typeof row.last_check_at === "string" &&
    typeof row.tracked_keyword_count === "number" &&
    row.tracked_keyword_count > 0 &&
    (typeof row.visibility === "number" || typeof row.top_100_count === "number")
  )
    return true;
  if ((row.tier === "full" || row.tier === "compact") && typeof row.checkedAt === "string")
    return [row.rows, row.domains].some((items) => Array.isArray(items) && items.length > 0);
  return ["data", "results", "rank_check", "latest_check", "checks", "rows", "items"].some((key) =>
    hasReceivedRankResult(row[key], depth + 1),
  );
}

export function hasNotificationResult(type: string, payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const row = payload as Record<string, unknown>;
  if (row.test === true) return false;
  if (type === "alert_fired")
    return typeof row.afterPosition === "number" || typeof row.beforePosition === "number";
  if (!["manual_run_summary", "scheduled_window_summary"].includes(type)) return false;
  if (!row.counts || typeof row.counts !== "object") return false;
  const counts = row.counts as Record<string, unknown>;
  return ["new", "up", "down", "unchanged"].some(
    (key) => typeof counts[key] === "number" && counts[key] > 0,
  );
}
