export type UsageProgress = {
  kind: "none" | "known" | "partial" | "unknown";
  percent: number | null;
  level: "ok" | "warning" | "exceeded";
};

/** Pure host-observation projection. A lower bound of zero does not establish zero usage. */
export function usageProgress(percent: number | null, partial: boolean): UsageProgress {
  if (percent === null) return { kind: "none", percent: null, level: "ok" };
  if (!Number.isFinite(percent) || percent < 0 || (partial && percent === 0))
    return { kind: "unknown", percent: null, level: "ok" };
  return {
    kind: partial ? "partial" : "known",
    percent,
    level: percent >= 100 ? "exceeded" : percent >= 80 ? "warning" : "ok",
  };
}

const severity = { ok: 0, warning: 1, exceeded: 2 } as const;
/** The more severe level; host accounting such as reservations or alerts can raise a reading. */
export function severerLevel(
  level: UsageProgress["level"],
  host: UsageProgress["level"] | undefined,
): UsageProgress["level"] {
  return host !== undefined && severity[host] > severity[level] ? host : level;
}
