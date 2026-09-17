"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { type DateFormat, formatDate, formatDateRange } from "@/lib/dates/format";
import { cn } from "@/lib/ui/cn";
import { StackSimpleIcon as StackSimple } from "@phosphor-icons/react/dist/csr/StackSimple";
import { useLocale, type useTranslations } from "next-intl";
import type { BacklinksTableDataRow } from "./BacklinksTableRows";

type BacklinksTableColumnsOptions = {
  onRunExpand: (domain: string, signature: string) => void;
};
type BacklinksTableTranslations = ReturnType<
  typeof useTranslations<"projectBacklinks.workspace.table">
>;

function lostDate(value: string | null, dateFormat: DateFormat, t: BacklinksTableTranslations) {
  return value
    ? t("lostOnDate", { date: formatDateRange(value, value, dateFormat) })
    : t("lost30Days");
}

function flagLabel(flag: BacklinksTableDataRow["flags"][number], t: BacklinksTableTranslations) {
  const labels = {
    image: "flagImage",
    nofollow: "flagNofollow",
    sitewide: "flagSitewide",
    sponsored: "flagSponsored",
    ugc: "flagUgc",
  } as const;
  return t(labels[flag]);
}

function SourceCell({
  onRunExpand,
  row,
  t,
}: Readonly<{
  onRunExpand: BacklinksTableColumnsOptions["onRunExpand"];
  row: BacklinksTableDataRow;
  t: BacklinksTableTranslations;
}>) {
  const dateFormat = useDateFormat();
  if (row.variant === "collapsed" && row.run) {
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        <StackSimple aria-hidden className="shrink-0 text-fg-muted" size={14} weight="regular" />
        <span className="truncate text-[12.5px] text-fg-muted">
          {t("sameFooterLink", { count: row.run.count })}
        </span>
        <button
          className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-accent-text hover:text-accent-text focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
          onClick={(event) => {
            event.stopPropagation();
            onRunExpand(row.run?.domain ?? "", row.run?.signature ?? "");
          }}
          type="button"
        >
          {t("showAll")}
        </button>
      </span>
    );
  }

  const source = <span className={row.status === "lost" ? "line-through" : ""}>{row.source}</span>;
  if (row.variant !== "domain") return source;

  return (
    <button
      className={cn(
        "border-0 bg-transparent p-0 text-left text-inherit",
        row.status === "lost" && "text-fg-muted",
      )}
      data-status={row.status}
      tabIndex={-1}
      type="button"
    >
      {source}
      {row.status === "lost" ? (
        <>
          {" "}
          <span className="sr-only">{lostDate(row.lostAt, dateFormat, t)}</span>
        </>
      ) : null}
    </button>
  );
}

function AnchorTargetCell({
  row,
  t,
}: Readonly<{ row: BacklinksTableDataRow; t: BacklinksTableTranslations }>) {
  if (row.variant === "collapsed") return null;
  return (
    <span className="grid min-w-0">
      <span className="truncate text-[13px]">
        {row.anchor ? `“${row.anchor}”` : t("imageLink")}
      </span>
      <span className="truncate font-sans tabular-nums text-[10.5px] text-fg-muted">
        → {row.target}
      </span>
    </span>
  );
}

function FlagsCell({
  row,
  t,
}: Readonly<{ row: BacklinksTableDataRow; t: BacklinksTableTranslations }>) {
  const dateFormat = useDateFormat();
  if (row.variant === "collapsed") return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {row.status === "new" ? (
        <span className="rounded-full bg-green/10 px-2 py-0.5 text-[10.5px] font-semibold text-green-text">
          {t("new")}
        </span>
      ) : null}
      {row.status === "lost" ? (
        <span className="rounded-full bg-red/10 px-2 py-0.5 text-[10.5px] font-semibold text-red-text">
          {lostDate(row.lostAt, dateFormat, t)}
        </span>
      ) : null}
      {row.flags.map((flag) => (
        <span
          className={cn(
            "rounded-control border px-1.5 py-px font-sans tabular-nums text-[10px]",
            flag === "sitewide"
              ? "border-yellow/60 text-yellow-text"
              : "border-border text-fg-muted",
          )}
          key={flag}
        >
          {flagLabel(flag, t)}
        </span>
      ))}
    </span>
  );
}

function MetricCell({ spam, value }: Readonly<{ spam?: boolean; value?: number }>) {
  const locale = useLocale();
  const formatted =
    value == null
      ? ""
      : new Intl.NumberFormat(locale, {
          maximumFractionDigits: spam ? 1 : 0,
          minimumFractionDigits: spam ? 1 : 0,
        }).format(value);
  return (
    <span
      className={cn(
        "font-sans tabular-nums text-[12.5px]",
        spam && value != null && value >= 5 && "text-yellow-text",
      )}
    >
      {formatted}
    </span>
  );
}

function FirstSeenCell({ value }: Readonly<{ value: string | null }>) {
  const dateFormat = useDateFormat();
  return (
    <span className="whitespace-nowrap text-[12px] text-fg-muted">
      {value ? formatDate(value, dateFormat) : ""}
    </span>
  );
}

export function backlinksTableColumns(
  { onRunExpand }: BacklinksTableColumnsOptions,
  t: BacklinksTableTranslations,
): readonly DataTableColumn<BacklinksTableDataRow>[] {
  return [
    {
      accessorKey: "source",
      cell: ({ row }) => <SourceCell onRunExpand={onRunExpand} row={row.original} t={t} />,
      header: t("source"),
      id: "source",
      meta: { flex: 1.12, title: t("source") },
      minSize: 192,
      size: 208,
    },
    {
      accessorKey: "anchor",
      cell: ({ row }) => <AnchorTargetCell row={row.original} t={t} />,
      header: t("anchorToTarget"),
      id: "anchor",
      meta: { flex: 1, title: t("anchorToTarget") },
      minSize: 224,
      size: 256,
    },
    {
      accessorKey: "flags",
      cell: ({ row }) => <FlagsCell row={row.original} t={t} />,
      enableSorting: false,
      header: t("flags"),
      id: "flags",
      meta: { title: t("flags") },
      minSize: 144,
      size: 160,
    },
    {
      accessorKey: "domainAuthority",
      cell: ({ row }) => <MetricCell value={row.original.domainAuthority} />,
      header: "DA",
      id: "authority",
      meta: { align: "end", title: t("domainAuthority") },
      minSize: 64,
      size: 64,
      sortDescFirst: true,
    },
    {
      accessorKey: "spam",
      cell: ({ row }) => <MetricCell spam value={row.original.spam} />,
      header: "Spam",
      id: "spam",
      meta: { align: "end", title: t("spam") },
      minSize: 72,
      size: 72,
    },
    {
      accessorKey: "links",
      cell: ({ row }) => <MetricCell value={row.original.links} />,
      header: t("links"),
      id: "links",
      meta: { align: "end", title: t("links") },
      minSize: 72,
      size: 72,
    },
    {
      accessorKey: "firstSeen",
      cell: ({ row }) => <FirstSeenCell value={row.original.firstSeen} />,
      header: t("firstSeen"),
      id: "firstSeen",
      meta: { title: t("firstSeen") },
      minSize: 120,
      size: 120,
    },
  ];
}
