"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, MenuSelectOptionItem, menuSelectPaperSx } from "@/components/ui";
import {
  type CostRateInfo,
  formatEstimateCents,
  runCostCents,
} from "@/lib/cost-estimate/project-estimate";
import type { SerpDepth } from "@/lib/serp/markets";
import Menu from "@mui/material/Menu";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react";
import { useState } from "react";
import { CheckDepthSplitButton } from "./CheckDepthSplitButton";

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
  showCheck?: boolean;
};

function checkCost(depth: SerpDepth, providerRate?: CostRateInfo) {
  if (!providerRate) return null;
  const costCents = runCostCents([depth], providerRate);
  return costCents == null ? null : formatEstimateCents(costCents);
}

function depthOptionLabel(depth: SerpDepth, providerRate?: CostRateInfo) {
  const cost = checkCost(depth, providerRate);
  return `Top ${depth}${cost ? ` · ${cost}` : ""}`;
}

function runCheckActionLabel(
  pending: boolean,
  primaryLabel: string | ((depth: SerpDepth) => string),
  selectedDepth: SerpDepth,
) {
  if (pending) return "Starting...";
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
  primaryLabel = "Run check",
  providerRate,
  runPending,
  showCheck = true,
}: Readonly<KeywordHeaderActionsProps>) {
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<HTMLElement | null>(null);
  const [depthSelection, setDepthSelection] = useState(() => ({
    effectiveDepth,
    selectedDepth: effectiveDepth,
  }));
  if (depthSelection.effectiveDepth !== effectiveDepth) {
    setDepthSelection({ effectiveDepth, selectedDepth: effectiveDepth });
  }
  const selectedDepth = depthSelection.selectedDepth;
  const { readOnly } = useProjectWriteMode();

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canUpdateKeyword && showCheck ? (
        <ProjectReadOnlyTooltip>
          <CheckDepthSplitButton
            actionLabel={runCheckActionLabel(runPending, primaryLabel, selectedDepth)}
            currentDepth={selectedDepth}
            disabled={readOnly || runPending}
            onAction={() => onRunCheck(selectedDepth)}
            onDepthChange={(depth) => setDepthSelection({ effectiveDepth, selectedDepth: depth })}
            optionLabel={(depth) => depthOptionLabel(depth, providerRate)}
            spinning={runPending}
          />
        </ProjectReadOnlyTooltip>
      ) : null}
      <Button
        aria-expanded={Boolean(actionsMenuAnchor)}
        aria-haspopup="menu"
        aria-label="More keyword actions"
        onClick={(event) => setActionsMenuAnchor(event.currentTarget)}
        sx={{ minWidth: 40, paddingX: 0.75 }}
        variant="secondary"
      >
        <DotsThree aria-hidden size={17} weight="regular" />
      </Button>
      <Menu
        anchorEl={actionsMenuAnchor}
        onClose={() => setActionsMenuAnchor(null)}
        open={Boolean(actionsMenuAnchor)}
        slotProps={{
          list: { "aria-label": "More keyword actions", dense: true, sx: { padding: 0 } },
          paper: { sx: menuSelectPaperSx },
        }}
      >
        {canUpdateKeyword ? (
          <MenuSelectOptionItem
            current={false}
            onSelect={() => {
              setActionsMenuAnchor(null);
              onToggleEdit();
            }}
            option={{
              label: editing ? "Close editor" : "Edit",
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
          option={{ label: "Export CSV", value: "export" }}
        />
      </Menu>
    </div>
  );
}
