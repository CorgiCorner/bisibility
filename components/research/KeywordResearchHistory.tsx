"use client";

import { KeywordHistoryMeta, modeChipLabel } from "@/components/research-history/HistoryMeta";
import { HistorySuggestions } from "@/components/research-history/HistorySuggestions";
import type { HistoryAdapter } from "@/components/research-history/history-adapter";
import { ResearchHistoryButton } from "@/components/research-history/ResearchHistoryButton";
import { toggleHistoryPin } from "@/components/research-history/toggle-history-pin";
import {
  loadKeywordResearchHistoryAction,
  readStoredKeywordResearchAction,
} from "@/lib/actions/research-history";
import type { OpenedKeywordResearch } from "@/lib/keyword-research/opened-research";
import { useTranslations } from "next-intl";

function useKeywordHistoryAdapter(
  projectId: string,
  onStored: (stored: OpenedKeywordResearch) => void,
): HistoryAdapter {
  const t = useTranslations("researchHistory");
  const modes = useTranslations("projectResearch.search");
  return {
    chipLabel: (chip) => (chip.facet === "mode" ? modeChipLabel(chip.value, modes) : chip.value),
    loadPage: async (input) => {
      const result = await loadKeywordResearchHistoryAction({ ...input, projectRef: projectId });
      if (!result.ok) throw new Error("History unavailable");
      return result.page;
    },
    noun: "checks",
    onOpen: async (row) => {
      const result = await readStoredKeywordResearchAction({
        projectRef: projectId,
        requestKey: row.key,
      });
      if (result.ok) onStored(result.stored);
    },
    onTogglePin: (row, pinned) => toggleHistoryPin(projectId, "keyword_research", row.key, pinned),
    renderMeta: (row) =>
      row.meta.kind === "keyword" ? (
        <KeywordHistoryMeta mode={row.meta.mode} scope={row.meta.scope} />
      ) : null,
    searchPlaceholder: t("searchKeywords"),
  };
}

export function KeywordResearchHistoryButton({
  onStored,
  projectId,
}: Readonly<{ onStored: (stored: OpenedKeywordResearch) => void; projectId: string }>) {
  return (
    <ResearchHistoryButton adapter={useKeywordHistoryAdapter(projectId, onStored)} size="input" />
  );
}

export function KeywordResearchSuggestions({
  draft,
  focused,
  onStored,
  projectId,
}: Readonly<{
  draft: string;
  focused: boolean;
  onStored: (stored: OpenedKeywordResearch) => void;
  projectId: string;
}>) {
  const adapter = useKeywordHistoryAdapter(projectId, onStored);
  return (
    <HistorySuggestions
      adapter={adapter}
      onOpen={(row) => void adapter.onOpen(row)}
      open={focused && draft.trim().length === 0}
    />
  );
}
