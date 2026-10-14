import type { BacklinksRow } from "@/lib/backlinks/types";
import { csvRowWithNumberFormat } from "@/lib/ui/csv";
import {
  aggregateBacklinksView,
  type BacklinksSlice,
  type BacklinksView,
  groupBacklinksByDomain,
  visibleBacklinkRows,
} from "./backlinks-table-model";

function backlinkCsvRow(values: readonly (number | string)[], spamColumn: number) {
  return csvRowWithNumberFormat(values, (value, index) =>
    index === spamColumn ? value.toFixed(1) : String(value),
  );
}

function aggregateHeader(view: Exclude<BacklinksView, "backlinks">) {
  if (view === "referring_domains") return "referring_domain,target_pages";
  if (view === "top_pages") return "top_page,referring_domains";
  return "anchor,referring_domains";
}

function aggregateCsv(
  view: Exclude<BacklinksView, "backlinks">,
  rows: readonly BacklinksRow[],
  now: Date,
) {
  const lines = aggregateBacklinksView(view, rows, now).map((row) =>
    backlinkCsvRow(
      [
        row.label,
        row.coverageCount,
        row.domainAuthority,
        row.spamScore,
        row.linksCount,
        row.firstSeen ?? "",
      ],
      3,
    ),
  );
  return [`${aggregateHeader(view)},da,spam,links,first_seen`, ...lines].join("\n");
}

function domainCsv(rows: readonly BacklinksRow[], now: Date) {
  const lines = groupBacklinksByDomain(rows, now).map((group) =>
    backlinkCsvRow(
      [
        group.sourceDomain,
        group.anchor || "(image)",
        `${group.linksCount} links -> ${group.targetCount} target pages`,
        group.flags.join(";"),
        group.domainAuthority,
        group.spamScore,
        group.linksCount,
        group.firstSeen ?? "",
        group.status,
        group.lostAt ?? "",
      ],
      5,
    ),
  );
  return [
    "source,anchor_target,coverage,flags,da,spam,links,first_seen,status,lost_at",
    ...lines,
  ].join("\n");
}

function linksCsv(rows: readonly BacklinksRow[], now: Date) {
  const lines = visibleBacklinkRows(rows, now).map((row) =>
    backlinkCsvRow(
      [
        row.sourceUrl,
        row.anchor || "(image)",
        row.targetUrl,
        row.flags.join(";"),
        row.domainAuthority,
        row.spamScore,
        row.linksCount,
        row.firstSeen ?? "",
        row.status,
        row.lostAt ?? "",
      ],
      5,
    ),
  );
  return ["source,anchor,target,flags,da,spam,links,first_seen,status,lost_at", ...lines].join(
    "\n",
  );
}

export function backlinksExportContent(input: {
  now: Date;
  rows: readonly BacklinksRow[];
  slice: BacklinksSlice;
  view: BacklinksView;
}) {
  if (input.view !== "backlinks") return aggregateCsv(input.view, input.rows, input.now);
  return input.slice === "one_per_domain"
    ? domainCsv(input.rows, input.now)
    : linksCsv(input.rows, input.now);
}
