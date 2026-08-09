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
import { serpDepthValues } from "@/lib/serp/markets";
// ButtonGroup children must stay MUI Buttons so the group keeps its joined corners.
import MuiButton from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Menu from "@mui/material/Menu";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  BellIcon as Bell,
  BellRingingIcon as BellRinging,
  CaretDownIcon as CaretDown,
  DownloadSimpleIcon as DownloadSimple,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import { useState } from "react";

type KeywordHeaderActionsProps = {
  alertCreated: boolean;
  alertCreating: boolean;
  canCreateAlert: boolean;
  canUpdateKeyword: boolean;
  editing: boolean;
  effectiveDepth: SerpDepth;
  onCreateAlert: () => void;
  onExport: () => void;
  onRunCheck: (depth: SerpDepth) => void;
  onToggleEdit: () => void;
  providerRate?: CostRateInfo;
  runPending: boolean;
};

function checkCost(depth: SerpDepth, providerRate?: CostRateInfo) {
  if (!providerRate) return null;
  const costCents = runCostCents([depth], providerRate);
  return costCents == null ? null : formatEstimateCents(costCents);
}

function checkLabel(depth: SerpDepth, providerRate?: CostRateInfo) {
  const cost = checkCost(depth, providerRate);
  return `Top ${depth}${cost ? ` · ${cost}` : ""}`;
}

export function KeywordHeaderActions({
  alertCreated,
  alertCreating,
  canCreateAlert,
  canUpdateKeyword,
  editing,
  effectiveDepth,
  onCreateAlert,
  onExport,
  onRunCheck,
  onToggleEdit,
  providerRate,
  runPending,
}: Readonly<KeywordHeaderActionsProps>) {
  const [depthMenuAnchor, setDepthMenuAnchor] = useState<HTMLElement | null>(null);
  const [depthSelection, setDepthSelection] = useState(() => ({
    effectiveDepth,
    selectedDepth: effectiveDepth,
  }));
  if (depthSelection.effectiveDepth !== effectiveDepth) {
    setDepthSelection({ effectiveDepth, selectedDepth: effectiveDepth });
  }
  const selectedDepth = depthSelection.selectedDepth;
  let alertLabel = "Add alert";
  if (alertCreating) alertLabel = "Adding...";
  else if (alertCreated) alertLabel = "Alert on";
  const { readOnly } = useProjectWriteMode();
  const AlertIcon = alertCreated ? BellRinging : Bell;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canUpdateKeyword ? (
        <ProjectReadOnlyTooltip>
          <Button
            disabled={readOnly || !canCreateAlert || alertCreating || alertCreated}
            onClick={onCreateAlert}
            startIcon={<AlertIcon size={15} weight={alertCreated ? "fill" : "bold"} />}
            sx={
              alertCreated
                ? { border: "1px solid var(--accent)", color: "var(--accent)" }
                : { color: "var(--fg-muted)" }
            }
            variant="secondary"
          >
            {alertLabel}
          </Button>
        </ProjectReadOnlyTooltip>
      ) : null}
      <Button
        onClick={onExport}
        startIcon={<DownloadSimple size={15} />}
        sx={{ color: "var(--fg-muted)" }}
        variant="secondary"
      >
        Export CSV
      </Button>
      {canUpdateKeyword ? (
        <ProjectReadOnlyTooltip>
          <Button
            disabled={readOnly}
            onClick={onToggleEdit}
            startIcon={<PencilSimple size={15} weight="bold" />}
            sx={{ color: "var(--fg-muted)" }}
            variant="secondary"
          >
            {editing ? "Close edit" : "Edit"}
          </Button>
        </ProjectReadOnlyTooltip>
      ) : null}
      {canUpdateKeyword ? (
        <ProjectReadOnlyTooltip>
          <ButtonGroup size="small" variant="contained">
            <MuiButton
              disabled={readOnly || runPending}
              onClick={() => onRunCheck(selectedDepth)}
              startIcon={<ArrowsClockwise size={15} weight="bold" />}
              sx={{ minHeight: 36 }}
            >
              {runPending
                ? "Starting..."
                : `Check now (${checkLabel(selectedDepth, providerRate)})`}
            </MuiButton>
            <MuiButton
              aria-label="Choose check depth"
              disabled={readOnly || runPending}
              onClick={(event) => setDepthMenuAnchor(event.currentTarget)}
              sx={{ minHeight: 36, minWidth: 34, paddingX: 0.75 }}
            >
              <CaretDown aria-hidden size={13} weight="bold" />
            </MuiButton>
          </ButtonGroup>
        </ProjectReadOnlyTooltip>
      ) : null}
      {canUpdateKeyword ? (
        <Menu
          anchorEl={depthMenuAnchor}
          onClose={() => setDepthMenuAnchor(null)}
          open={Boolean(depthMenuAnchor)}
          slotProps={{
            list: { "aria-label": "Check depth", dense: true, sx: { padding: 0 } },
            paper: { sx: menuSelectPaperSx },
          }}
        >
          {serpDepthValues.map((depth) => (
            <MenuSelectOptionItem
              current={depth === selectedDepth}
              key={depth}
              onSelect={() => {
                setDepthSelection({ effectiveDepth, selectedDepth: depth });
                setDepthMenuAnchor(null);
              }}
              option={{ label: checkLabel(depth, providerRate), value: String(depth) }}
            />
          ))}
        </Menu>
      ) : null}
    </div>
  );
}
