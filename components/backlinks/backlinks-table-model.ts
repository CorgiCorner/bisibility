import type { BacklinksRow } from "@/lib/backlinks/types";
import type { BacklinkFlag } from "@/lib/providers/types";

export type BacklinksView = "backlinks" | "referring_domains" | "top_pages" | "anchors";
export type BacklinksSlice = "one_per_domain" | "all_links";
export type BacklinksFilter = "all" | "new" | "lost" | "broken";

export type BacklinksDomainGroup = {
  anchor: string;
  domainAuthority: number;
  firstSeen: string | null;
  flags: BacklinkFlag[];
  linksCount: number;
  lostAt: string | null;
  rows: BacklinksRow[];
  sourceDomain: string;
  spamScore: number;
  status: BacklinksRow["status"];
  targetCount: number;
};

export type BacklinksAggregateRow = {
  coverageCount: number;
  domainAuthority: number;
  firstSeen: string | null;
  key: string;
  label: string;
  linksCount: number;
  secondary: string;
  spamScore: number;
};

type CollapsedDomainItem =
  | { kind: "row"; row: BacklinksRow }
  | { count: number; kind: "collapsed"; rows: BacklinksRow[]; signature: string };

const DAY_MS = 86_400_000;

function withinDays(value: string | null, now: Date, days: number) {
  if (!value) return false;
  const age = now.getTime() - new Date(`${value}T00:00:00.000Z`).getTime();
  return age >= 0 && age <= days * DAY_MS;
}

export function visibleBacklinkRows(rows: readonly BacklinksRow[], now: Date) {
  return rows.filter(
    (row) => row.status !== "lost" || (row.lostAt !== null && withinDays(row.lostAt, now, 90)),
  );
}

function earliestDate(rows: readonly BacklinksRow[]) {
  return (
    rows
      .map((row) => row.firstSeen)
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null
  );
}

function groupStatus(rows: readonly BacklinksRow[]): BacklinksRow["status"] {
  if (rows.every((row) => row.status === "lost")) return "lost";
  if (rows.some((row) => row.status === "new")) return "new";
  return "active";
}

function uniqueFlags(rows: readonly BacklinksRow[]) {
  return [...new Set(rows.flatMap((row) => row.flags))];
}

export function groupBacklinksByDomain(
  rows: readonly BacklinksRow[],
  now: Date,
): BacklinksDomainGroup[] {
  const grouped = new Map<string, BacklinksRow[]>();
  for (const row of visibleBacklinkRows(rows, now)) {
    grouped.set(row.sourceDomain, [...(grouped.get(row.sourceDomain) ?? []), row]);
  }
  return [...grouped.entries()]
    .map(([sourceDomain, domainRows]) => ({
      anchor: domainRows[0]?.anchor ?? "",
      domainAuthority: Math.max(...domainRows.map((row) => row.domainAuthority)),
      firstSeen: earliestDate(domainRows),
      flags: uniqueFlags(domainRows),
      linksCount: domainRows.reduce((sum, row) => sum + row.linksCount, 0),
      lostAt:
        domainRows
          .map((row) => row.lostAt)
          .filter((date): date is string => Boolean(date))
          .sort()
          .at(-1) ?? null,
      rows: domainRows,
      sourceDomain,
      spamScore: Math.max(...domainRows.map((row) => row.spamScore)),
      status: groupStatus(domainRows),
      targetCount: new Set(domainRows.map((row) => row.targetUrl)).size,
    }))
    .sort(
      (left, right) =>
        right.domainAuthority - left.domainAuthority ||
        left.sourceDomain.localeCompare(right.sourceDomain),
    );
}

function groupMatches(group: BacklinksDomainGroup, filter: BacklinksFilter, now: Date) {
  if (filter === "all") return true;
  if (filter === "broken") return false;
  if (filter === "new") {
    return group.rows.some((row) => row.status === "new" && withinDays(row.firstSeen, now, 30));
  }
  return group.rows.some((row) => row.status === "lost" && withinDays(row.lostAt, now, 30));
}

export function filterDomainGroups(
  groups: readonly BacklinksDomainGroup[],
  filter: BacklinksFilter,
  now: Date,
) {
  return groups.filter((group) => groupMatches(group, filter, now));
}

export function domainFilterCounts(
  groups: readonly BacklinksDomainGroup[],
  now: Date,
  totalDomains = groups.length,
) {
  return {
    all: totalDomains,
    broken: 0,
    lost: groups.filter((group) => groupMatches(group, "lost", now)).length,
    new: groups.filter((group) => groupMatches(group, "new", now)).length,
  };
}

function signature(row: BacklinksRow) {
  return `${row.anchor}\u0000${row.targetUrl}`;
}

export function collapseDomainRows(
  rows: readonly BacklinksRow[],
  expandedSignatures: ReadonlySet<string> = new Set(),
): CollapsedDomainItem[] {
  const runs = new Map<string, BacklinksRow[]>();
  for (const row of rows) {
    const key = signature(row);
    runs.set(key, [...(runs.get(key) ?? []), row]);
  }
  const seen = new Map<string, number>();
  const collapsed = new Set<string>();
  return rows.flatMap<CollapsedDomainItem>((row) => {
    const key = signature(row);
    const run = runs.get(key) ?? [];
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    if (run.length < 3 || expandedSignatures.has(key)) return [{ kind: "row" as const, row }];
    if (index < 2) return [{ kind: "row" as const, row }];
    if (collapsed.has(key)) return [];
    collapsed.add(key);
    return [
      {
        count: run.length - 2,
        kind: "collapsed" as const,
        rows: run.slice(2),
        signature: key,
      },
    ];
  });
}

function aggregate(
  rows: readonly BacklinksRow[],
  keyFor: (row: BacklinksRow) => string,
  labelFor: (row: BacklinksRow) => string,
  coverageFor: (rows: BacklinksRow[]) => { count: number; label: string },
) {
  const groups = new Map<string, BacklinksRow[]>();
  for (const row of rows) {
    const key = keyFor(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, groupedRows]): BacklinksAggregateRow => {
      const coverage = coverageFor(groupedRows);
      return {
        coverageCount: coverage.count,
        domainAuthority: Math.max(...groupedRows.map((row) => row.domainAuthority)),
        firstSeen: earliestDate(groupedRows),
        key,
        label: labelFor(groupedRows[0]),
        linksCount: groupedRows.reduce((sum, row) => sum + row.linksCount, 0),
        secondary: `${coverage.count} ${coverage.label}`,
        spamScore: Math.max(...groupedRows.map((row) => row.spamScore)),
      };
    })
    .sort(
      (left, right) => right.linksCount - left.linksCount || left.label.localeCompare(right.label),
    );
}

export function aggregateBacklinksView(
  view: Exclude<BacklinksView, "backlinks">,
  rows: readonly BacklinksRow[],
  now: Date,
) {
  const visible = visibleBacklinkRows(rows, now);
  if (view === "referring_domains") {
    return aggregate(
      visible,
      (row) => row.sourceDomain,
      (row) => row.sourceDomain,
      (group) => ({
        count: new Set(group.map((row) => row.targetUrl)).size,
        label: "target pages",
      }),
    );
  }
  if (view === "top_pages") {
    return aggregate(
      visible,
      (row) => row.targetUrl,
      (row) => row.targetUrl,
      (group) => ({
        count: new Set(group.map((row) => row.sourceDomain)).size,
        label: "referring domains",
      }),
    );
  }
  return aggregate(
    visible,
    (row) => row.anchor.trim().toLowerCase() || "(image)",
    (row) => row.anchor || "(image)",
    (group) => ({
      count: new Set(group.map((row) => row.sourceDomain)).size,
      label: "referring domains",
    }),
  );
}
