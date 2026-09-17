"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { RelativePastFact } from "@/lib/format/relative-time";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { useFormatter, useTranslations } from "next-intl";
import {
  type SavedKeywordsTableRow,
  savedKeywordsTableColumns,
} from "./saved-keywords-table-columns";

type SavedKeywordsTableRowsProps = {
  canDelete: boolean;
  canTrack: boolean;
  onRemove: (row: SavedKeywordRow) => void;
  onSelectionChange: (selection: ReadonlySet<string>) => void;
  onToggle: (row: SavedKeywordRow) => void;
  onTrack: (row: SavedKeywordRow) => void;
  projectRef: string;
  rows: readonly SavedKeywordsTableRow[];
  selectedIds: ReadonlySet<string>;
};

export function SavedKeywordsTableRows({
  canDelete,
  canTrack,
  onRemove,
  onSelectionChange,
  onToggle,
  onTrack,
  projectRef,
  rows,
  selectedIds,
}: Readonly<SavedKeywordsTableRowsProps>) {
  const format = useFormatter();
  const t = useTranslations("projectRankTracker.keywordImport.management.saved");
  function relativePast(fact: RelativePastFact) {
    if (fact.kind === "justNow") return t("relative.justNow");
    if (fact.kind === "yesterday") return t("relative.yesterday");
    if (fact.kind === "minutesAgo") return t("relative.minutesAgo", { count: fact.count });
    if (fact.kind === "hoursAgo") return t("relative.hoursAgo", { count: fact.count });
    return t("relative.daysAgo", { count: fact.count });
  }
  return (
    <DataTable
      ariaLabel={t("tableAria")}
      columns={savedKeywordsTableColumns({
        canDelete,
        canTrack,
        formatCurrency: (value) => format.number(value, { currency: "USD", style: "currency" }),
        formatVolume: (value) => format.number(value),
        labels: {
          actions: t("actions"),
          cpc: t("cpc"),
          difficulty: t("difficulty"),
          intent: t("intent"),
          intentLabel: (intent) => {
            if (intent === "commercial") return t("intentCommercial");
            if (intent === "informational") return t("intentInformational");
            if (intent === "navigational") return t("intentNavigational");
            if (intent === "transactional") return t("intentTransactional");
            return "";
          },
          keyword: t("keyword"),
          researchFallback: t("researchFallback"),
          relativePast,
          saved: t("saved"),
          snapshotStale: t("snapshotStale"),
          source: t("source"),
          sourceAria: (values) => t("sourceAria", values),
          trend: t("trend"),
          variants: (values) => t("variants", values),
          volume: t("volume"),
          volumeTrend: (values) => t("volumeTrend", values),
        },
        onRemove,
        onTrack,
        projectRef,
      })}
      density="compact"
      id="saved-keywords-table"
      layout="auto"
      onRowClick={onToggle}
      onSelectionChange={onSelectionChange}
      onSortingChange={() => undefined}
      rowClassName={(row) =>
        selectedIds.has(row.publicId)
          ? "shadow-[inset_2px_0_0_var(--accent)] [&>[data-column-id=selection]]:shadow-[inset_2px_0_0_var(--accent)]"
          : undefined
      }
      rows={rows}
      selection={selectedIds}
      sorting={null}
    />
  );
}
