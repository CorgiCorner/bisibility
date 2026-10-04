"use client";

import { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { menuSelectPaperStyle } from "@/components/ui/MenuSelect";
import { MenuSelectOptionItem } from "@/components/ui/MenuSelectOptionItem";
import { estimateRankUsage } from "@/lib/cost-estimate/native-usage";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { SerpDepth } from "@/lib/serp/constants";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CheckDepthSplitButton } from "./CheckDepthSplitButton";
import { KeywordDataRefresh } from "./KeywordDataRefresh";

type KeywordHeaderActionsProps = {
  canUpdateKeyword: boolean;
  editing: boolean;
  effectiveDepth: SerpDepth;
  onExport: () => void;
  onRunCheck: (depth: SerpDepth) => void;
  onToggleEdit: () => void;
  primaryLabel?: string | ((depth: SerpDepth) => string);
  providerRate?: CostRateInfo;
  runPending: boolean;
  runActive?: boolean;
  showCheck?: boolean;
};

function depthOptionLabel(
  depth: SerpDepth,
  providerRate: CostRateInfo | undefined,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordDetail.actions">>,
  usage: ReturnType<typeof useNativeUsageFormat>,
) {
  const estimate = providerRate ? estimateRankUsage([depth], providerRate) : null;
  return t("topWithCost", { cost: estimate ? ` · ${usage.format(estimate)}` : "", depth });
}

function runCheckActionLabel(
  pending: boolean,
  primaryLabel: string | ((depth: SerpDepth) => string),
  selectedDepth: SerpDepth,
) {
  if (pending) return null;
  if (typeof primaryLabel === "function") return primaryLabel(selectedDepth);
  return primaryLabel;
}

export function KeywordHeaderActions({
  canUpdateKeyword,
  editing,
  effectiveDepth,
  onExport,
  onRunCheck,
  onToggleEdit,
  primaryLabel,
  providerRate,
  runPending,
  runActive = false,
  showCheck = true,
}: Readonly<KeywordHeaderActionsProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.actions");
  const usage = useNativeUsageFormat();
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<HTMLElement | null>(null);
  const [depthSelection, setDepthSelection] = useState(() => ({
    effectiveDepth,
    selectedDepth: effectiveDepth,
  }));
  if (depthSelection.effectiveDepth !== effectiveDepth) {
    setDepthSelection({ effectiveDepth, selectedDepth: effectiveDepth });
  }
  const selectedDepth = depthSelection.selectedDepth;
  const resolvedPrimaryLabel = primaryLabel ?? ((depth: SerpDepth) => t("runCheck", { depth }));
  const { readOnly } = useProjectWriteMode();

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <KeywordDataRefresh />
      {canUpdateKeyword && showCheck ? (
        <ProjectReadOnlyTooltip>
          <CheckDepthSplitButton
            actionLabel={
              runActive
                ? t("checking")
                : (runCheckActionLabel(runPending, resolvedPrimaryLabel, selectedDepth) ??
                  t("starting"))
            }
            caretAriaLabel={t("chooseDepth")}
            copy={{
              changeDefault: t("changeDefault"),
              depthMenu: t("depthMenu"),
              optionLabel: (depth) => depthOptionLabel(depth, providerRate, t, usage),
              shallowVisibility: t("shallowVisibility"),
            }}
            currentDepth={selectedDepth}
            disabled={readOnly || runPending || runActive}
            onAction={() => onRunCheck(selectedDepth)}
            onDepthChange={(depth) => setDepthSelection({ effectiveDepth, selectedDepth: depth })}
            optionLabel={(depth) => depthOptionLabel(depth, providerRate, t, usage)}
            spinning={runPending || runActive}
          />
        </ProjectReadOnlyTooltip>
      ) : null}
      <Button
        aria-expanded={Boolean(actionsMenuAnchor)}
        aria-haspopup="menu"
        aria-label={t("moreActions")}
        onClick={(event) => setActionsMenuAnchor(event.currentTarget)}
        style={{ minWidth: 40, paddingLeft: 6, paddingRight: 6 }}
        variant="secondary"
      >
        <DotsThree aria-hidden size={17} weight="regular" />
      </Button>
      <Menu
        anchorEl={actionsMenuAnchor}
        onClose={() => setActionsMenuAnchor(null)}
        open={Boolean(actionsMenuAnchor)}
        listProps={{ "aria-label": t("moreActions"), style: { padding: 0 } }}
        contentProps={{ style: menuSelectPaperStyle }}
      >
        {canUpdateKeyword ? (
          <MenuSelectOptionItem
            current={false}
            onSelect={() => {
              setActionsMenuAnchor(null);
              onToggleEdit();
            }}
            option={{
              label: editing ? t("closeEditor") : t("edit"),
              value: "edit",
            }}
          />
        ) : null}
        <MenuSelectOptionItem
          current={false}
          onSelect={() => {
            setActionsMenuAnchor(null);
            onExport();
          }}
          option={{ label: t("exportCsv"), value: "export" }}
        />
      </Menu>
    </div>
  );
}
