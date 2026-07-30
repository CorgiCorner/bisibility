import type { BacklinksRow } from "@/lib/backlinks/types";
import {
  CaretRightIcon as CaretRight,
  StackSimpleIcon as StackSimple,
} from "@phosphor-icons/react";
import {
  type BacklinksDomainGroup,
  type BacklinksSlice,
  collapseDomainRows,
} from "./backlinks-table-model";

const columns =
  "grid-cols-[30px_minmax(190px,1.12fr)_minmax(220px,1fr)_148px_46px_54px_48px_118px]";

function shortDate(value: string | null) {
  if (!value) return "";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function lostDate(value: string | null) {
  if (!value) return "lost";
  return `lost ${new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })}`;
}

function sourcePath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function targetPath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function Flags({ row }: Readonly<{ row: Pick<BacklinksRow, "flags" | "lostAt" | "status"> }>) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {row.status === "new" ? (
        <span className="rounded-full bg-green/10 px-2 py-0.5 text-[10.5px] font-semibold text-green">
          new
        </span>
      ) : null}
      {row.status === "lost" ? (
        <span className="rounded-full bg-red/10 px-2 py-0.5 text-[10.5px] font-semibold text-red">
          {lostDate(row.lostAt)}
        </span>
      ) : null}
      {row.flags.map((flag) => (
        <span
          className={`rounded-[5px] border px-1.5 py-px font-mono text-[10px] ${
            flag === "sitewide"
              ? "border-yellow/60 text-yellow-strong"
              : "border-border-strong text-fg-muted"
          }`}
          key={flag}
        >
          {flag}
        </span>
      ))}
    </span>
  );
}

function DataCells({
  anchor,
  firstSeen,
  flags,
  links,
  source,
  spam,
  status,
  target,
  domainAuthority,
}: Readonly<{
  anchor: string;
  domainAuthority?: number;
  firstSeen: string | null;
  flags: BacklinksRow["flags"];
  links?: number;
  source: string;
  spam?: number;
  status: Pick<BacklinksRow, "lostAt" | "status">;
  target: string;
}>) {
  return (
    <>
      <span className={`truncate ${status.status === "lost" ? "line-through" : ""}`}>{source}</span>
      <span className="grid min-w-0">
        <span className="truncate text-[13px]">{anchor ? `“${anchor}”` : "(image link)"}</span>
        <span className="truncate font-mono text-[10.5px] text-fg-faint">→ {target}</span>
      </span>
      <Flags row={{ ...status, flags }} />
      <span className="text-right font-mono text-[12.5px]">{domainAuthority ?? ""}</span>
      <span
        className={`text-right font-mono text-[12.5px] ${
          spam != null && spam >= 5 ? "text-yellow-strong" : ""
        }`}
      >
        {spam?.toFixed(1) ?? ""}
      </span>
      <span className="text-right font-mono text-[12.5px] text-fg-muted">{links ?? ""}</span>
      <span className="whitespace-nowrap text-[12px] text-fg-muted">{shortDate(firstSeen)}</span>
    </>
  );
}

function LinkRow({ row, summary = false }: Readonly<{ row: BacklinksRow; summary?: boolean }>) {
  return (
    <div
      className={`grid ${columns} items-center gap-2 border-t border-border/70 bg-bg-sunken/40 px-4 py-2 ${
        row.status === "lost" ? "opacity-55" : ""
      }`}
      data-status={row.status}
    >
      <span />
      <DataCells
        anchor={row.anchor}
        domainAuthority={summary ? row.domainAuthority : undefined}
        firstSeen={row.firstSeen}
        flags={row.flags}
        links={summary ? row.linksCount : undefined}
        source={sourcePath(row.sourceUrl)}
        spam={summary ? row.spamScore : undefined}
        status={row}
        target={targetPath(row.targetUrl)}
      />
    </div>
  );
}

function DomainRow({
  expanded,
  expandedRuns,
  group,
  onRunExpand,
  onToggle,
}: Readonly<{
  expanded: boolean;
  expandedRuns: ReadonlySet<string>;
  group: BacklinksDomainGroup;
  onRunExpand: (signature: string) => void;
  onToggle: () => void;
}>) {
  const expandable = group.rows.length > 1;
  return (
    <>
      <button
        aria-expanded={expandable ? expanded : undefined}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${group.sourceDomain}`}
        className={`grid w-full ${columns} items-center gap-2 border-0 border-t border-border/70 bg-transparent px-4 py-2.5 text-left text-fg hover:bg-bg-sunken/55 focus-visible:bg-bg-sunken/55 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
          expandable ? "cursor-pointer" : "cursor-default"
        } ${group.status === "lost" ? "opacity-55" : ""}`}
        data-status={group.status}
        onClick={expandable ? onToggle : undefined}
        type="button"
      >
        <span className="grid h-[22px] w-[22px] place-items-center">
          {expandable ? (
            <CaretRight
              className={`text-fg-faint transition-transform ${expanded ? "rotate-90" : ""}`}
              size={11}
              weight="bold"
            />
          ) : null}
        </span>
        <DataCells
          anchor={`${group.anchor || "(image)"}${group.rows.length > 1 ? ` +${group.rows.length - 1} more` : ""}`}
          domainAuthority={group.domainAuthority}
          firstSeen={group.firstSeen}
          flags={group.flags}
          links={group.linksCount}
          source={group.sourceDomain}
          spam={group.spamScore}
          status={{
            lostAt: group.lostAt,
            status: group.status,
          }}
          target={`${group.linksCount} links → ${group.targetCount} target pages`}
        />
      </button>
      {expanded
        ? collapseDomainRows(group.rows, expandedRuns).map((item, index) =>
            item.kind === "row" ? (
              <LinkRow key={`${item.row.sourceUrl}:${index}`} row={item.row} />
            ) : (
              <div
                className="flex items-center gap-2.5 border-t border-border/70 bg-bg-sunken/40 py-2 pl-[54px] pr-4"
                key={item.signature}
              >
                <StackSimple aria-hidden className="text-fg-faint" size={14} />
                <span className="text-[12.5px] text-fg-muted">
                  {item.count} more pages carry the same footer link
                </span>
                <button
                  className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-accent-hover hover:text-accent focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => onRunExpand(item.signature)}
                  type="button"
                >
                  Show all
                </button>
              </div>
            ),
          )
        : null}
    </>
  );
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
  groups: BacklinksDomainGroup[];
  onRunExpand: (domain: string, signature: string) => void;
  onToggle: (domain: string) => void;
  rows: BacklinksRow[];
  slice: BacklinksSlice;
}>) {
  if (slice === "all_links") {
    return rows.map((row, index) => (
      <LinkRow key={`${row.sourceUrl}:${index}`} row={row} summary />
    ));
  }
  return groups.map((group) => (
    <DomainRow
      expanded={expandedDomains.has(group.sourceDomain)}
      expandedRuns={expandedRuns.get(group.sourceDomain) ?? new Set()}
      group={group}
      key={group.sourceDomain}
      onRunExpand={(signature) => onRunExpand(group.sourceDomain, signature)}
      onToggle={() => onToggle(group.sourceDomain)}
    />
  ));
}

export function BacklinksColumnHeaders() {
  return (
    <div
      className={`grid ${columns} items-center gap-2 border-b border-border-strong px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[.08em] text-fg-muted`}
    >
      <span />
      <span>Source</span>
      <span>Anchor - target</span>
      <span>Flags</span>
      <span className="flex items-center justify-end gap-1 font-semibold text-accent-hover">
        DA <span aria-label="sorted descending">⌄</span>
      </span>
      <span className="text-right">Spam</span>
      <span className="text-right">Links</span>
      <span>First seen</span>
    </div>
  );
}
