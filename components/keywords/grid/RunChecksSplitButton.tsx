"use client";

import { CheckDepthSplitButton } from "@/components/keywords/CheckDepthSplitButton";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { SerpDepth } from "@/lib/serp/constants";
import { useTranslations } from "next-intl";
import { effectiveRowDepth, selectionDepthLabel } from "./run-check-depth";

type RunChecksSplitButtonProps = {
  checksRunning: boolean;
  chosenDepth: SerpDepth | null;
  /** Names the market this spend lands in. `null` is the project level and reads as before. */
  marketScope?: MarketScope | null;
  onDepthChange: (depth: SerpDepth) => void;
  onRunChecks: (keywordIds: string[], depth?: SerpDepth) => void;
  readOnly: boolean;
  selectedRows: KeywordRow[];
};

export function RunChecksSplitButton({
  checksRunning,
  chosenDepth,
  marketScope = null,
  onDepthChange,
  onRunChecks,
  readOnly,
  selectedRows,
}: Readonly<RunChecksSplitButtonProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.runChecks");
  const selectedIds = selectedRows.map((row) => row.id);
  const selectionDepths = new Set(selectedRows.map(effectiveRowDepth));
  const uniformDepth = selectionDepths.size === 1 ? selectionDepths.values().next().value : null;
  const currentDepth = chosenDepth ?? uniformDepth ?? null;
  const selectionLabel =
    chosenDepth != null
      ? t("top", { depth: chosenDepth })
      : selectionDepthLabel(selectedRows, (depth) => t("top", { depth }));
  const baseAction = selectedRows.length === 1 ? t("runCheck") : t("runChecks");
  const action = marketScope
    ? selectedRows.length === 1
      ? t("runCheckInMarket", { market: marketScope.label })
      : t("runChecksInMarket", { market: marketScope.label })
    : baseAction;

  return (
    <ProjectReadOnlyTooltip>
      <CheckDepthSplitButton
        actionLabel={
          checksRunning ? t("starting") : t("actionWithDepth", { action, depth: selectionLabel })
        }
        copy={{
          changeDefault: t("changeDefault"),
          depthMenu: t("depthMenu"),
          optionLabel: (depth) => t("top", { depth }),
          shallowVisibility: t("shallowVisibility"),
        }}
        currentDepth={currentDepth}
        caretAriaLabel={t("chooseDepth")}
        disabled={readOnly || checksRunning}
        menuSide="top"
        onAction={() =>
          chosenDepth != null ? onRunChecks(selectedIds, chosenDepth) : onRunChecks(selectedIds)
        }
        onDepthChange={onDepthChange}
        size="xs"
        spinning={checksRunning}
      />
    </ProjectReadOnlyTooltip>
  );
}
