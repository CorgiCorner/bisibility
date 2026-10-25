import type { IndexingDay, IndexingUrl, SitemapSnapshotRow } from "@/lib/search-index/ui-model";

export const indexingColors = {
  indexed: "var(--green)",
  not_indexed: "var(--yellow)",
  inspection_failed: "var(--fg-muted)",
  not_checked: "var(--bg-inset)",
};

export function trendDays(days: readonly IndexingDay[]) {
  return days.slice(-90).map((day) => ({
    ...day,
    // Pausing inspections leaves a slot, even when a stored summary carries known counts.
    plottedIndexed: day.stop === "off" ? 0 : day.indexed,
    plottedNotIndexed: day.stop === "off" ? 0 : day.notIndexed,
  }));
}

export function trendTicks(days: readonly IndexingDay[]) {
  return [
    ...new Set(
      Array.from({ length: Math.min(5, days.length) }, (_, index) =>
        Math.round((index * (days.length - 1)) / Math.max(1, Math.min(5, days.length) - 1)),
      ),
    ),
  ].map((index) => days[index].date);
}

// Keep integer ticks on a 1 / 2 / 5 scale, with at most four intervals.
export function trendValueTicks(maximum: number) {
  const rough = Math.max(1, maximum / 4);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((value) => value * magnitude).find((value) => value >= rough) ?? 1;
  const intervals = Math.max(1, Math.ceil(maximum / step));
  return Array.from({ length: intervals + 1 }, (_, index) => index * step);
}

export function pausedRanges(days: readonly IndexingDay[]) {
  const ranges: { start: string; end: string }[] = [];
  for (const [index, day] of days.entries()) {
    if (day.stop !== "off") continue;
    const previous = days[index - 1];
    const adjacent =
      previous &&
      new Date(`${day.date}T00:00:00Z`).getTime() -
        new Date(`${previous.date}T00:00:00Z`).getTime() ===
        86400000;
    if (previous?.stop === "off" && adjacent) ranges[ranges.length - 1].end = day.date;
    else ranges.push({ start: day.date, end: day.date });
  }
  return ranges;
}

export function groupSitemaps(rows: readonly SitemapSnapshotRow[]) {
  const paths = new Set(rows.map((row) => row.path));
  const result: (SitemapSnapshotRow & { id: string; depth: number })[] = [];
  const seen = new Set<string>();
  const visit = (row: SitemapSnapshotRow, depth: number) => {
    if (seen.has(row.path)) return;
    seen.add(row.path);
    result.push({ ...row, id: row.path, depth });
    for (const child of rows.filter((child) => child.parentPath === row.path))
      visit(child, depth + 1);
  };
  for (const row of rows.filter((row) => !row.parentPath || !paths.has(row.parentPath)))
    visit(row, 0);
  // Retain malformed cyclic/orphaned provider rows instead of silently dropping them.
  for (const row of rows) visit(row, 0);
  return result;
}

export function historyStrip(detail: IndexingUrl, through: string, timeZone = "UTC") {
  const calendar = new Intl.DateTimeFormat(undefined, {
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateKey = (at: Date) => {
    const parts = Object.fromEntries(
      calendar.formatToParts(new Date(at)).map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const changes = [...(detail.stripChanges ?? detail.history?.changes ?? [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  let state: "indexed" | "not_indexed" | "not_checked" = "not_checked";
  let cursor = 0;
  const end = new Date(`${through}T00:00:00Z`).getTime();
  return Array.from({ length: 90 }, (_, index) => {
    const date = new Date(end - (89 - index) * 86400000).toISOString().slice(0, 10);
    while (cursor < changes.length && dateKey(changes[cursor].at) <= date) {
      const next = changes[cursor++].next;
      // Failed inspections are not Google state transitions.
      if (
        next &&
        typeof next === "object" &&
        !Array.isArray(next) &&
        "verdict" in next &&
        !next.inspectionError
      )
        state = next.verdict === "PASS" ? "indexed" : "not_indexed";
    }
    return { date, state };
  });
}
