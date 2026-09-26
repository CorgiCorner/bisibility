"use client";

import { CheckStatusChip } from "@/components/ui/CheckStatusChip";
import { dataLinkClassName } from "@/components/ui/data-link-styles";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Tooltip } from "@/components/ui/Tooltip";
import type { CheckRunRow } from "@/lib/checks/contract";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import Link from "next/link";
import type { ReactNode } from "react";
import { type CheckRunDetailLine, CountryLevelBadge } from "./CheckRunDetails";
import {
  type CheckRunsTranslations,
  formatResult,
  formatRunCost,
  formatWhen,
} from "./check-runs-format";
import type { RunTableColumns } from "./use-run-table-width";

export type CheckRunsTableRow = {
  detail?: CheckRunDetailLine;
  id: string;
  kind: "group" | "row" | "section";
  keyword: string;
  label: string;
  run: CheckRunRow;
  subRows?: readonly CheckRunsTableRow[];
};

type ColumnOptions = {
  columns: RunTableColumns;
  keywordHref: (keywordPublicId: string) => string;
  locale: string;
  now: Date;
  t: CheckRunsTranslations;
};

function PositionDelta({ run, t }: Readonly<{ run: CheckRunRow; t: CheckRunsTranslations }>) {
  if (run.previousPosition === null || run.position === null) return null;
  const delta = run.previousPosition - run.position;
  if (delta === 0) {
    return (
      <span className="rounded bg-bg-inset px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] text-fg-muted">
        0
      </span>
    );
  }
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] font-semibold ${
        delta > 0 ? "bg-green/10 text-green-text" : "bg-red/10 text-red-text"
      }`}
    >
      <Icon aria-hidden size={9} weight="regular" />
      {t("number", { value: Math.abs(delta) })}
    </span>
  );
}

function ProviderCell({ run, t }: Readonly<{ run: CheckRunRow; t: CheckRunsTranslations }>) {
  const label =
    run.status === "failed" && run.attemptCount > 1
      ? t("providers", { count: run.attemptCount })
      : run.providerLabel;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <span className="truncate">{label}</span>
      {run.viaFallback ? (
        <span className="rounded-full bg-yellow/10 px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] font-semibold text-yellow-text">
          {t("fallbackBadge")}
        </span>
      ) : null}
      {run.degradedToCountry ? <CountryLevelBadge /> : null}
    </div>
  );
}

function ResultCell({
  locale,
  now,
  run,
  t,
}: Readonly<{ locale: string; now: Date; run: CheckRunRow; t: CheckRunsTranslations }>) {
  const value = formatResult(run, now, { locale, t });
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={`min-w-0 truncate ${run.status === "failed" ? "text-red-text" : "text-fg"}`}
        title={value}
      >
        {value}
      </span>
      {run.status === "completed" ? <PositionDelta run={run} t={t} /> : null}
    </div>
  );
}

function CostCell({
  locale,
  run,
  t,
}: Readonly<{ locale: string; run: CheckRunRow; t: CheckRunsTranslations }>) {
  if (run.status !== "failed") return <>{formatRunCost(run, { locale, t })}</>;
  return (
    <Tooltip content={t("notBilledTooltip")}>
      <span aria-label={t("notBilledTooltip")} className="cursor-help">
        -
      </span>
    </Tooltip>
  );
}

function column(
  id: string,
  header: string,
  size: number,
  cell: (run: CheckRunRow) => ReactNode,
  options: { flex?: number; minSize?: number } = {},
): DataTableColumn<CheckRunsTableRow> {
  return {
    cell: ({ row }) => cell(row.original.run),
    enableSorting: false,
    header,
    id,
    meta: { flex: options.flex, sortable: false },
    minSize: options.minSize ?? size,
    size,
  };
}

export function checkRunsTableColumns({
  columns,
  keywordHref,
  locale,
  now,
  t,
}: Readonly<ColumnOptions>): readonly DataTableColumn<CheckRunsTableRow>[] {
  const definitions: DataTableColumn<CheckRunsTableRow>[] = [
    column("status", t("status"), 140, (run) => <CheckStatusChip kind={run.status} />, {
      minSize: 140,
    }),
    column(
      "keyword",
      t("keyword"),
      148,
      (run) => (
        <Link
          className={`block truncate font-semibold outline-none ${dataLinkClassName}`}
          href={keywordHref(run.keywordPublicId)}
        >
          {run.keyword}
        </Link>
      ),
      { flex: 2, minSize: 144 },
    ),
    column(
      "location",
      t("location"),
      132,
      (run) => (
        <span className="block truncate text-fg" title={run.location}>
          {run.location}
        </span>
      ),
      { flex: 2, minSize: 128 },
    ),
    column("language", t("language"), 104, (run) => (
      <div className="min-w-0">
        <span className="block truncate text-fg-muted">{run.languageLabel ?? "-"}</span>
        {!run.researchMetricsAvailable ? (
          <Tooltip content={t("researchMetricsUnavailableTooltip")}>
            <button
              aria-label={t("researchMetricsUnavailableAria", {
                tooltip: t("researchMetricsUnavailableTooltip"),
              })}
              className="mt-1 inline-flex cursor-help rounded-full border border-dashed border-border-control bg-bg-sunken px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] font-semibold text-fg-muted"
              type="button"
            >
              {t("researchMetricsUnavailable")}
            </button>
          </Tooltip>
        ) : null}
      </div>
    )),
    column("device", t("device"), 72, (run) => (
      <span className="text-fg-muted">{run.device === "mobile" ? t("mobile") : t("desktop")}</span>
    )),
    column(
      "result",
      t("result"),
      112,
      (run) => <ResultCell locale={locale} now={now} run={run} t={t} />,
      {
        minSize: 108,
      },
    ),
    column("provider", t("provider"), 132, (run) => <ProviderCell run={run} t={t} />, {
      flex: 1,
      minSize: 128,
    }),
  ];
  if (columns.depth) {
    definitions.push(
      column("depth", t("depth"), 76, (run) => (
        <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">
          {typeof run.requestedDepth === "number"
            ? t("top", { depth: run.requestedDepth })
            : t("notAvailable")}
        </span>
      )),
    );
  }
  if (columns.cost) {
    definitions.push(
      column("cost", t("cost"), 76, (run) => (
        <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">
          <CostCell locale={locale} run={run} t={t} />
        </span>
      )),
    );
  }
  if (columns.when) {
    definitions.push(
      column("when", t("when"), 76, (run) => (
        <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">
          {formatWhen(run, now, { t })}
        </span>
      )),
    );
  }
  return definitions;
}
