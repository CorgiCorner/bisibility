"use client";

import { SerpHistoryMeta } from "@/components/research-history/HistoryMeta";
import { HistorySuggestions } from "@/components/research-history/HistorySuggestions";
import type { HistoryAdapter } from "@/components/research-history/history-adapter";
import { ResearchHistoryButton } from "@/components/research-history/ResearchHistoryButton";
import { toggleHistoryPin } from "@/components/research-history/toggle-history-pin";
import { loadSerpPlaygroundHistoryAction } from "@/lib/actions/research-history";
import { readSerpPlaygroundAction } from "@/lib/actions/serp-playground";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
import type { HistoryRow } from "@/lib/research-history/contract";
import { useTranslations } from "next-intl";

function useSerpHistoryAdapter(
  projectRef: string,
  selectRun: (run: ComparisonRun) => void,
): HistoryAdapter {
  const t = useTranslations("researchHistory");
  return {
    chipLabel: (chip) =>
      chip.facet === "device" ? t(chip.value === "mobile" ? "mobile" : "desktop") : chip.value,
    loadPage: async (input) => {
      const result = await loadSerpPlaygroundHistoryAction({ ...input, projectRef });
      if (!result.ok) throw new Error("History unavailable");
      return result.page;
    },
    noun: "checks",
    onOpen: async (row) => {
      const result = await readSerpPlaygroundAction({ projectRef, runId: row.key });
      if (result.ok) selectRun(result.run);
    },
    onTogglePin: (row, pinned) => toggleHistoryPin(projectRef, "serp_playground", row.key, pinned),
    renderMeta: (row) =>
      row.meta.kind === "serp" ? (
        <SerpHistoryMeta
          aiOverview={row.meta.aiOverview}
          device={row.meta.device}
          market={row.meta.market}
        />
      ) : null,
    searchPlaceholder: t("searchKeywords"),
  };
}

export function SerpPlaygroundHistoryButton({
  projectRef,
  selectRun,
}: Readonly<{ projectRef: string; selectRun: (run: ComparisonRun) => void }>) {
  return (
    <ResearchHistoryButton adapter={useSerpHistoryAdapter(projectRef, selectRun)} size="input" />
  );
}

export function SerpPlaygroundSuggestions({
  focused,
  projectRef,
  query,
  selectRun,
}: Readonly<{
  focused: boolean;
  projectRef: string;
  query: string;
  selectRun: (run: ComparisonRun) => void;
}>) {
  const adapter = useSerpHistoryAdapter(projectRef, selectRun);
  return (
    <HistorySuggestions
      adapter={adapter}
      onOpen={(row: HistoryRow) => void adapter.onOpen(row)}
      open={focused && query.trim().length === 0}
    />
  );
}
