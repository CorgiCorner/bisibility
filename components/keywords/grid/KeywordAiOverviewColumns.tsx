"use client";
import { AiOverviewContent } from "@/components/keywords/AiOverviewContent";
import { Button } from "@/components/ui/Button";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tooltip } from "@/components/ui/Tooltip";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import type { RankTrackerAiOverviewFact } from "@/lib/queries/rank-tracker-ai-overview-facts";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { keywordRowDevices } from "./KeywordDeviceCell";

type OverviewState = "notChecked" | "notShown" | "shown";
type FactRow = { id: string; subRows?: readonly { id: string }[] };

const overviewTone = {
  notChecked: "attention",
  notShown: "neutral",
  shown: "positive",
} as const;

/** Grouped rows use a market-group id, so the stored check lives on the only target. */
export function aiOverviewFactForRow(
  row: FactRow,
  byId: ReadonlyMap<string, RankTrackerAiOverviewFact>,
): RankTrackerAiOverviewFact | undefined {
  const own = byId.get(row.id);
  if (own) return own;
  const children = row.subRows ?? [];
  if (children.length !== 1) return undefined;
  return byId.get(children[0]?.id ?? "");
}

export function aiOverviewCellState(
  row: FactRow,
  byId: ReadonlyMap<string, RankTrackerAiOverviewFact>,
): OverviewState {
  const fact = aiOverviewFactForRow(row, byId);
  if (fact) return fact.citation.shown ? "shown" : "notShown";
  const children = row.subRows ?? [];
  const facts = children.flatMap((child) => {
    const item = byId.get(child.id);
    return item ? [item] : [];
  });
  if (facts.some((item) => item.citation.shown)) return "shown";
  if (children.length > 0 && facts.length === children.length) return "notShown";
  return "notChecked";
}

function overviewState(
  fact: RankTrackerAiOverviewFact | undefined,
  state: OverviewState | undefined,
): OverviewState {
  if (state) return state;
  if (!fact) return "notChecked";
  return fact.citation.shown ? "shown" : "notShown";
}

function EmptyMark() {
  return <span>-</span>;
}

const keptColumnIds = new Set(["keyword", "frequency", "lastChecked"]);

function deviceLabel(device: string, t: (key: "deviceDesktop" | "deviceMobile") => string) {
  return t(device.toLowerCase() === "mobile" ? "deviceMobile" : "deviceDesktop");
}

export function AiOverviewDeviceCell({ row }: { row: KeywordRow }) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const format = useFormatter();
  const parent = marketGridParent(row);
  const devices = parent ? keywordRowDevices(row) : [row.device];
  if (!devices.length) return <span>{t("notCheckedYet")}</span>;
  return (
    <span>
      {format.list(
        devices.map((device) => deviceLabel(device, t)),
        { type: "conjunction" },
      )}
    </span>
  );
}

export function AiOverviewStatusCell({
  row: _row,
  fact,
  state,
}: {
  row: KeywordRow;
  fact?: RankTrackerAiOverviewFact;
  state?: OverviewState;
}) {
  const t = useTranslations("projectRankTracker.aiOverviewList");
  const [open, setOpen] = useState(false);
  const status = overviewState(fact, state);
  return (
    <span className="grid gap-1">
      <StatusChip label={t(status)} tone={overviewTone[status]} />
      {fact?.overview ? (
        <>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            aria-expanded={open}
            className="justify-self-start px-0"
            onClick={() => setOpen((current) => !current)}
          >
            {t("viewOverview")}
          </Button>
          {open ? <AiOverviewContent ai={fact.overview} /> : null}
        </>
      ) : null}
    </span>
  );
}

export function AiOverviewDomainCell({
  row: _row,
  fact,
}: {
  row: KeywordRow;
  fact?: RankTrackerAiOverviewFact;
}) {
  const t = useTranslations("projectRankTracker.aiOverviewList");
  const format = useFormatter();
  if (!fact?.citation.shown) return <EmptyMark />;
  if (!fact.citation.complete)
    return (
      <Tooltip content={t("incompleteHint")} semantics="description">
        <span>{t("notAvailable")}</span>
      </Tooltip>
    );
  if (!fact.citation.cited || fact.citation.citedPosition === null)
    return <span>{t("notCited")}</span>;
  return <span>{t("citedAt", { position: format.number(fact.citation.citedPosition) })}</span>;
}

export function AiOverviewPageCell({
  row: _row,
  fact,
}: {
  row: KeywordRow;
  fact?: RankTrackerAiOverviewFact;
}) {
  const t = useTranslations("projectRankTracker.aiOverviewList");
  if (!fact?.citation.shown) return <EmptyMark />;
  if (!fact.citedPath || !fact.citation.citedUrl) return <span>{t("none")}</span>;
  return (
    <a
      href={fact.citation.citedUrl}
      className="underline underline-offset-4"
      target="_blank"
      rel="noreferrer noopener"
    >
      {fact.citedPath}
    </a>
  );
}

export function useKeywordAiOverviewColumns(
  columns: readonly DataTableColumn<KeywordRow>[],
  facts: readonly RankTrackerAiOverviewFact[],
) {
  const t = useTranslations("projectRankTracker.aiOverviewList");
  const columnT = useTranslations("projectRankTracker.keywordImport.management.columns");
  return useMemo(() => {
    const byId = new Map(facts.map((fact) => [fact.keywordId, fact]));
    const presentation = (row: KeywordRow) => ({
      fact: aiOverviewFactForRow(row, byId),
      state: aiOverviewCellState(row, byId),
    });
    const kept = columns.filter((column) => keptColumnIds.has(String(column.id)));
    const device: DataTableColumn<KeywordRow> = {
      id: "device",
      header: columnT("device"),
      meta: { title: columnT("device"), sortable: false },
      size: 120,
      minSize: 96,
      cell: ({ row }) => <AiOverviewDeviceCell row={row.original} />,
    };
    const overview: DataTableColumn<KeywordRow> = {
      id: "aiOverview",
      header: t("overview"),
      meta: { title: t("overview"), sortable: false },
      size: 180,
      minSize: 140,
      cell: ({ row }) => (
        <AiOverviewStatusCell row={row.original} {...presentation(row.original)} />
      ),
    };
    const domain: DataTableColumn<KeywordRow> = {
      id: "yourDomain",
      header: t("yourDomain"),
      meta: { title: t("yourDomain"), sortable: false },
      size: 160,
      minSize: 120,
      cell: ({ row }) => (
        <AiOverviewDomainCell row={row.original} fact={presentation(row.original).fact} />
      ),
    };
    const citedPage: DataTableColumn<KeywordRow> = {
      id: "citedPage",
      header: t("citedPage"),
      meta: { title: t("citedPage"), sortable: false },
      size: 160,
      minSize: 120,
      cell: ({ row }) => (
        <AiOverviewPageCell row={row.original} fact={presentation(row.original).fact} />
      ),
    };
    const keyword = kept.find((column) => column.id === "keyword");
    const schedule = kept.find((column) => column.id === "frequency");
    const lastChecked = kept.find((column) => column.id === "lastChecked");
    return [device, keyword, schedule, overview, domain, citedPage, lastChecked].filter(
      (column): column is DataTableColumn<KeywordRow> => Boolean(column),
    );
  }, [columnT, columns, facts, t]);
}
