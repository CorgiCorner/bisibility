"use client";

import { Button } from "@/components/ui/Button";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { EnginesPageModel, EnginesTableRow } from "@/lib/ai-tracking/engines-model";
import { formatPromptUsd } from "@/lib/ai-tracking/prompt-format";
import Link from "next/link";
import type { useTranslations } from "next-intl";
import { aiVisibilityTableLayouts } from "./ai-visibility-column-layout";
import {
  type overviewEngineCopy,
  overviewEngineLabel,
  overviewProviderLabel,
} from "./overview-labels";

const layout = aiVisibilityTableLayouts.engineChoices;
type Translate = ReturnType<typeof useTranslations<"projectAiTracking">>;
type ToggleRow = Extract<EnginesTableRow, { availability: "toggle" }>;
type EngineLabels = ReturnType<typeof overviewEngineCopy>;

export function engineColumns(input: {
  canWrite: boolean;
  change: (row: ToggleRow, enabled: boolean) => void;
  labels: EngineLabels;
  locale: string;
  pending: boolean;
  provider: EnginesPageModel["providers"][number] | null;
  providersHref: string;
  rankHref: string;
  t: Translate;
}): DataTableColumn<EnginesTableRow>[] {
  const { canWrite, change, labels, locale, pending, provider, providersHref, rankHref, t } = input;
  return [
    {
      cell: ({ row }) => <EngineName labels={labels} row={row.original} t={t} />,
      header: t("engine"),
      id: "engine",
      meta: { flex: layout.engine.flex, sortable: false },
      minSize: layout.engine.minSize,
      size: layout.engine.size,
    },
    {
      cell: ({ row }) => (
        <AnsweredBy href={providersHref} provider={provider} row={row.original} t={t} />
      ),
      header: t("enginesTab.answeredBy"),
      id: "answeredBy",
      meta: { sortable: false },
      size: layout.answeredBy.size,
    },
    {
      cell: ({ row }) => <PriceCell locale={locale} row={row.original} t={t} />,
      header: t("enginesTab.perAnswer"),
      id: "price",
      meta: { sortable: false },
      size: layout.price.size,
    },
    {
      cell: ({ row }) => (
        <EngineState
          href={rankHref}
          onChange={change}
          pending={pending}
          row={row.original}
          t={t}
          writable={canWrite}
        />
      ),
      header: t("enginesTab.columnState"),
      id: "state",
      meta: { lockResize: layout.state.lockResize, sortable: false },
      minSize: layout.state.minSize,
      size: layout.state.size,
    },
  ];
}

function EngineName({
  labels,
  row,
  t,
}: Readonly<{ labels: EngineLabels; row: EnginesTableRow; t: Translate }>) {
  if (row.kind !== "row") return null;
  const recent = "recentAnswers" in row ? row.recentAnswers : 0;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{engineName(row, labels, t)}</span>
      {recent > 0 ? (
        <span className="text-xs text-fg-muted">
          {t("enginesTab.recentAnswers", { count: recent })}
        </span>
      ) : null}
    </span>
  );
}

function engineName(
  row: Extract<EnginesTableRow, { kind: "row" }>,
  labels: EngineLabels,
  t: Translate,
) {
  if (row.nameKey === "google_overview") return t("enginesTab.engineGoogleOverview");
  if (row.nameKey === "google_ai_mode") return t("enginesTab.engineGoogleAiMode");
  if (row.nameKey === "bing_copilot") return t("enginesTab.engineBingCopilot");
  return overviewEngineLabel(row.nameKey, labels);
}

function AnsweredBy({
  href,
  provider,
  row,
  t,
}: Readonly<{
  href: string;
  provider: EnginesPageModel["providers"][number] | null;
  row: EnginesTableRow;
  t: Translate;
}>) {
  if (row.kind !== "row" || row.availability === "unavailable") return null;
  if (row.availability === "rank_tracker") return t("enginesTab.rankTracker");
  if (!provider) return t("overview.unknownCount");
  if (!provider.connected) {
    return (
      <Link className="text-accent-text underline underline-offset-2" href={href}>
        {t("enginesTab.connectProvider")}
      </Link>
    );
  }
  return overviewProviderLabel(provider.id);
}

function PriceCell({
  locale,
  row,
  t,
}: Readonly<{ locale: string; row: EnginesTableRow; t: Translate }>) {
  if (row.kind !== "row") return null;
  if (row.price.kind === "none") return null;
  if (row.price.kind === "free") return t("enginesTab.freeRank");
  if (row.price.kind === "by_length") return t("enginesTab.byLength");
  if (row.price.kind === "dash") return t("overview.unknownCount");
  return formatPromptUsd(row.price.usd, locale);
}

function EngineState({
  href,
  onChange,
  pending,
  row,
  t,
  writable,
}: Readonly<{
  href: string;
  onChange: (row: ToggleRow, enabled: boolean) => void;
  pending: boolean;
  row: EnginesTableRow;
  t: Translate;
  writable: boolean;
}>) {
  if (row.kind !== "row") return null;
  if (row.availability === "unavailable") return t("enginesTab.unavailable");
  if (row.availability === "rank_tracker") {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {row.on ? <span>{t("enginesTab.on")}</span> : null}
        <Link className="text-accent-text underline underline-offset-2" href={href}>
          {t("enginesTab.rankLink")}
        </Link>
      </span>
    );
  }
  if (!writable) return row.enabled ? t("enginesTab.on") : t("enginesTab.off");
  if (row.enabled) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span>{t("enginesTab.on")}</span>
        <Button
          className="w-fit"
          disabled={pending}
          onClick={() => onChange(row, false)}
          size="sm"
          type="button"
          variant="secondary"
        >
          {t("enginesTab.turnOff")}
        </Button>
      </span>
    );
  }
  return (
    <Button
      className="w-fit"
      disabled={pending}
      onClick={() => onChange(row, true)}
      size="sm"
      type="button"
      variant="secondary"
    >
      {t("enginesTab.turnOn")}
    </Button>
  );
}
