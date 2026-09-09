"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableRowBase, DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { BacklinksRow } from "@/lib/backlinks/types";
import { useMemo, useState } from "react";
import { backlinksTableColumns } from "./backlinks-table-columns";
import {
  type BacklinksDomainGroup,
  type BacklinksSlice,
  collapseDomainRows,
} from "./backlinks-table-model";

const TABLE_ID = "backlinks-results-table";

type BacklinksDataVariant = "collapsed" | "domain" | "link";

export type BacklinksTableDataRow = DataTableRowBase & {
  anchor: string;
  domainAuthority?: number;
  firstSeen: string | null;
  flags: BacklinksRow["flags"];
  label: string;
  links?: number;
  lostAt: string | null;
  run?: { count: number; domain: string; signature: string };
  source: string;
  sourceDomain: string;
  spam?: number;
  status: BacklinksRow["status"];
  target: string;
  variant: BacklinksDataVariant;
};

type BuildBacklinksTableRowsOptions = {
  expandedRuns: ReadonlyMap<string, ReadonlySet<string>>;
  groups: readonly BacklinksDomainGroup[];
  rows: readonly BacklinksRow[];
  slice: BacklinksSlice;
};

function pathFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function linkRow(row: BacklinksRow, id: string, summary: boolean): BacklinksTableDataRow {
  return {
    anchor: row.anchor,
    domainAuthority: summary ? row.domainAuthority : undefined,
    firstSeen: row.firstSeen,
    flags: row.flags,
    id,
    label: pathFromUrl(row.sourceUrl),
    links: summary ? row.linksCount : undefined,
    lostAt: row.lostAt,
    source: pathFromUrl(row.sourceUrl),
    sourceDomain: row.sourceDomain,
    spam: summary ? row.spamScore : undefined,
    status: row.status,
    target: pathFromUrl(row.targetUrl),
    variant: "link",
  };
}

function collapsedRow({
  count,
  domain,
  signature,
}: {
  count: number;
  domain: string;
  signature: string;
}): BacklinksTableDataRow {
  return {
    anchor: "",
    firstSeen: null,
    flags: [],
    id: `collapsed:${domain}:${signature}`,
    label: `${count} more pages carry the same footer link`,
    lostAt: null,
    run: { count, domain, signature },
    source: "",
    sourceDomain: domain,
    status: "active",
    target: "",
    variant: "collapsed",
  };
}

function domainRow(group: BacklinksDomainGroup, expandedRuns: ReadonlySet<string>) {
  const children = collapseDomainRows(group.rows, expandedRuns).map((item, index) =>
    item.kind === "row"
      ? linkRow(item.row, `link:${group.sourceDomain}:${index}:${item.row.sourceUrl}`, false)
      : collapsedRow({
          count: item.count,
          domain: group.sourceDomain,
          signature: item.signature,
        }),
  );
  return {
    anchor: `${group.anchor || "(image)"}${group.rows.length > 1 ? ` +${group.rows.length - 1} more` : ""}`,
    domainAuthority: group.domainAuthority,
    firstSeen: group.firstSeen,
    flags: group.flags,
    id: `domain:${group.sourceDomain}`,
    kind: "group" as const,
    label: group.sourceDomain,
    links: group.linksCount,
    lostAt: group.lostAt,
    source: group.sourceDomain,
    sourceDomain: group.sourceDomain,
    spam: group.spamScore,
    status: group.status,
    subRows: children,
    target: `${group.linksCount} links → ${group.targetCount} target pages`,
    variant: "domain" as const,
  } satisfies BacklinksTableDataRow;
}

export function buildBacklinksTableRows({
  expandedRuns,
  groups,
  rows,
  slice,
}: BuildBacklinksTableRowsOptions): BacklinksTableDataRow[] {
  if (slice === "all_links") {
    return rows.map((row, index) => linkRow(row, `link:${index}:${row.sourceUrl}`, true));
  }
  return groups.map((group) => domainRow(group, expandedRuns.get(group.sourceDomain) ?? new Set()));
}

export function BacklinksRows({
  expandedDomains,
  expandedRuns,
  groups,
  onRunExpand,
  onToggle,
  rows,
  slice,
}: Readonly<{
  expandedDomains: ReadonlySet<string>;
  expandedRuns: ReadonlyMap<string, ReadonlySet<string>>;
  groups: readonly BacklinksDomainGroup[];
  onRunExpand: (domain: string, signature: string) => void;
  onToggle: (domain: string) => void;
  rows: readonly BacklinksRow[];
  slice: BacklinksSlice;
}>) {
  const [sorting, setSorting] = useState<DataTableSort | null>({
    direction: "desc",
    field: "authority",
  });
  const tableRows = useMemo(
    () => buildBacklinksTableRows({ expandedRuns, groups, rows, slice }),
    [expandedRuns, groups, rows, slice],
  );
  const columns = useMemo(() => backlinksTableColumns({ onRunExpand }), [onRunExpand]);
  const expanded = useMemo(
    () =>
      new Set(
        tableRows
          .filter((row) => row.kind === "group" && expandedDomains.has(row.sourceDomain))
          .map((row) => row.id),
      ),
    [expandedDomains, tableRows],
  );

  function handleExpandedChange(next: ReadonlySet<string>) {
    for (const row of tableRows) {
      if (row.kind !== "group") continue;
      if (expanded.has(row.id) !== next.has(row.id)) onToggle(row.sourceDomain);
    }
  }

  return (
    <div className="min-w-0 [&>[role=table]]:border-0">
      <DataTable<BacklinksTableDataRow>
        ariaLabel="Backlinks"
        columns={columns}
        expanded={expanded}
        id={TABLE_ID}
        layout="auto"
        onExpandedChange={handleExpandedChange}
        onSortingChange={setSorting}
        rowClassName={(row) => (row.status === "lost" ? "text-fg-muted" : undefined)}
        rows={tableRows}
        sorting={sorting}
        sortingMode="client"
      />
    </div>
  );
}

/**
 * Kept as a compatibility export while BacklinksTable owns the toolbar and
 * panel composition. DataTable now renders the only header row.
 */
export function BacklinksColumnHeaders() {
  return null;
}
