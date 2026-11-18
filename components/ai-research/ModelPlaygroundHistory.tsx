"use client";

import { engineChipLabel, ModelHistoryMeta } from "@/components/research-history/HistoryMeta";
import { HistorySuggestions } from "@/components/research-history/HistorySuggestions";
import type { HistoryAdapter } from "@/components/research-history/history-adapter";
import { ResearchHistoryButton } from "@/components/research-history/ResearchHistoryButton";
import { toggleHistoryPin } from "@/components/research-history/toggle-history-pin";
import { loadModelPlaygroundHistoryAction } from "@/lib/actions/research-history";
import { nativeHistoryLabel, nativeHistoryModel } from "@/lib/model-playground/history-label";
import type { HistoryRow } from "@/lib/research-history/contract";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function historyModelOption(value: string, fallback = value) {
  const model = nativeHistoryModel(value);
  return { value, label: model?.model ?? fallback, secondary: model?.provider };
}

function useModelHistoryAdapter(projectId: string): HistoryAdapter {
  const t = useTranslations("researchHistory");
  const engines = useTranslations("projectAiResearch");
  const router = useRouter();
  const openHref = (row: HistoryRow) => appPath(projectId, "agent-reports", row.key);
  return {
    allHref: `${appPath(projectId, "agent-reports")}?kind=prompt_explorer`,
    chipLabel: (chip) => chip.value,
    modelOption: (value) => historyModelOption(value, engineChipLabel(value, engines)),
    loadPage: async (input) => {
      const result = await loadModelPlaygroundHistoryAction({ ...input, projectRef: projectId });
      if (!result.ok) throw new Error("History unavailable");
      return result.page;
    },
    noun: "runs",
    onOpen: (row) => router.push(openHref(row)),
    openHref,
    onTogglePin: (row, pinned) => toggleHistoryPin(projectId, "model_playground", row.key, pinned),
    renderMeta: (row) =>
      row.meta.kind === "model" ? (
        <ModelHistoryMeta
          engines={row.meta.engines.map((engine) =>
            engine.startsWith("api:")
              ? nativeHistoryLabel(engine, engines("modelPlayground.historyApiResponse"))
              : engine,
          )}
        />
      ) : null,
    searchPlaceholder: t("searchPrompts"),
  };
}

export function ModelPlaygroundHistoryButton({
  projectId,
  outline = false,
}: Readonly<{ projectId: string; outline?: boolean }>) {
  return (
    <ResearchHistoryButton
      adapter={useModelHistoryAdapter(projectId)}
      variant={outline ? "outline" : "secondary"}
    />
  );
}

export function ModelPlaygroundSuggestions({
  focused,
  projectId,
  prompt,
}: Readonly<{ focused: boolean; projectId: string; prompt: string }>) {
  const adapter = useModelHistoryAdapter(projectId);
  return (
    <HistorySuggestions
      adapter={adapter}
      onOpen={(row: HistoryRow) => void adapter.onOpen(row)}
      open={focused && prompt.trim().length === 0}
    />
  );
}
