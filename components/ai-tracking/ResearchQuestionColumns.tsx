"use client";

import { Button } from "@/components/ui/Button";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import {
  formatResearchObservedAt,
  formatResearchVolume,
  type ResearchQuestion,
} from "@/lib/ai-research/research-questions";
import { cn } from "@/lib/ui/cn";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import type { useTranslations } from "next-intl";
import { overviewEngineCopy, overviewEngineLabel } from "./overview-labels";

export type ResearchTableRow = ResearchQuestion & { kind: "row" | "section" };

type ResearchCopy = ReturnType<typeof useTranslations<"projectAiTracking.research">>;
type TrackingCopy = ReturnType<typeof useTranslations<"projectAiTracking">>;

export function researchQuestionColumns(
  t: ResearchCopy,
  tracking: TrackingCopy,
  locale: string,
  expanded: ReadonlySet<string>,
  toggleExpanded: (id: string) => void,
): readonly DataTableColumn<ResearchTableRow>[] {
  return [
    questionColumn(t, expanded, toggleExpanded),
    volumeColumn(t, locale),
    brandsColumn(t),
    youColumn(t),
    seenColumn(t, tracking, locale),
  ];
}

function questionColumn(
  t: ResearchCopy,
  expanded: ReadonlySet<string>,
  toggleExpanded: (id: string) => void,
): DataTableColumn<ResearchTableRow> {
  return {
    cell: ({ row: { original } }) => (
      <div className="flex min-w-0 items-start gap-2">
        <Button
          aria-controls={
            expanded.has(original.id) ? `research-answer-${original.rowIndex}` : undefined
          }
          aria-expanded={expanded.has(original.id)}
          aria-label={t("showAnswer", { prompt: original.text })}
          className="size-8 shrink-0 p-0"
          onClick={() => toggleExpanded(original.id)}
          size="xs"
          variant="ghost"
        >
          {expanded.has(original.id) ? (
            <CaretDownIcon aria-hidden size={16} weight="regular" />
          ) : (
            <CaretRightIcon aria-hidden size={16} weight="regular" />
          )}
        </Button>
        <span className="min-w-0 break-words">{original.text}</span>
      </div>
    ),
    header: t("columnQuestion"),
    id: "question",
    meta: { flex: 1, lockVisible: true },
    minSize: 240,
    size: 320,
  };
}

function volumeColumn(t: ResearchCopy, locale: string): DataTableColumn<ResearchTableRow> {
  return {
    cell: ({ row: { original } }) => (
      <span className="tabular-nums">
        {formatResearchVolume(original.volume, locale) ?? t("volumeMissing")}
      </span>
    ),
    header: t("columnVolume"),
    id: "volume",
    size: 110,
  };
}

function brandsColumn(t: ResearchCopy): DataTableColumn<ResearchTableRow> {
  return {
    cell: ({ row: { original } }) =>
      original.brands.length ? (
        <span className="flex flex-wrap gap-1">
          {original.brands.map((brand) => (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-ui-micro",
                brand.kind === "project" ? "bg-blue/15 text-blue-text" : "bg-bg-sunken text-fg",
              )}
              key={brand.id}
            >
              {brand.kind === "project" ? t("youToken") : brand.label}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-fg-muted">{t("volumeMissing")}</span>
      ),
    header: t("columnBrands"),
    id: "brands",
    minSize: 160,
    size: 220,
  };
}

function youColumn(t: ResearchCopy): DataTableColumn<ResearchTableRow> {
  return {
    cell: ({ row: { original } }) => (
      <span
        className={
          original.youNamed ? "text-ui-caption text-blue-text" : "text-ui-caption text-fg-muted"
        }
      >
        {original.youNamed ? t("youNamed") : t("youNotNamed")}
      </span>
    ),
    header: t("columnYou"),
    id: "you",
    size: 110,
  };
}

function seenColumn(
  t: ResearchCopy,
  tracking: TrackingCopy,
  locale: string,
): DataTableColumn<ResearchTableRow> {
  const labels = overviewEngineCopy(tracking);
  return {
    cell: ({ row: { original } }) => {
      const model = original.model ? overviewEngineLabel(original.model, labels) : "";
      const date = formatResearchObservedAt(original.observedAt, locale);
      if (!model && !date) return <span className="text-fg-muted">{t("volumeMissing")}</span>;
      return (
        <span className="text-ui-caption text-fg-muted">
          {date ? t("seenWithDate", { date, model }) : t("seenModel", { model })}
        </span>
      );
    },
    header: t("columnSeen"),
    id: "seen",
    size: 180,
  };
}
