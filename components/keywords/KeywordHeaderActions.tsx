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
  DotsThreeIcon as DotsThree,
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
  primaryLabel?: string | ((depth: SerpDepth) => string);
  providerRate?: CostRateInfo;
  runPending: boolean;
  showCheck?: boolean;
};

const checkActionSx = {
  backgroundColor: "var(--accent-solid)",
  borderColor: "var(--accent-solid)",
  color: "var(--accent-on-solid)",
  "&:hover": {
    backgroundColor: "var(--accent-solid-hover)",
    borderColor: "var(--accent-solid-hover)",
  },
} as const;

function checkCost(depth: SerpDepth, providerRate?: CostRateInfo) {
  if (!providerRate) return null;
  const costCents = runCostCents([depth], providerRate);
  return costCents == null ? null : formatEstimateCents(costCents);
}

function depthOptionLabel(depth: SerpDepth, providerRate?: CostRateInfo) {
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
  primaryLabel = "Run check",
  providerRate,
  runPending,
  showCheck = true,
}: Readonly<KeywordHeaderActionsProps>) {
  const [depthMenuAnchor, setDepthMenuAnchor] = useState<HTMLElement | null>(null);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<HTMLElement | null>(null);
  const [depthSelection, setDepthSelection] = useState(() => ({
    effectiveDepth,
    selectedDepth: effectiveDepth,
  }));
  if (depthSelection.effectiveDepth !== effectiveDepth) {
    setDepthSelection({ effectiveDepth, selectedDepth: effectiveDepth });
  }
  const selectedDepth = depthSelection.selectedDepth;
  const resolvedPrimaryLabel =
    typeof primaryLabel === "function" ? primaryLabel(selectedDepth) : primaryLabel;
  let alertLabel = "Add alert";
  if (alertCreating) alertLabel = "Adding...";
  else if (alertCreated) alertLabel = "Alert on";
  const { readOnly } = useProjectWriteMode();
  const AlertIcon = alertCreated ? BellRinging : Bell;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canUpdateKeyword && showCheck ? (
        <ProjectReadOnlyTooltip>
          <ButtonGroup size="small" variant="contained">
            <MuiButton
              disabled={readOnly || runPending}
              onClick={() => onRunCheck(selectedDepth)}
              startIcon={<ArrowsClockwise size={15} weight="bold" />}
              sx={{ ...checkActionSx, minHeight: 40 }}
            >
              {runPending ? "Starting..." : resolvedPrimaryLabel}
            </MuiButton>
            <MuiButton
              aria-label="Choose check depth"
              disabled={readOnly || runPending}
              onClick={(event) => setDepthMenuAnchor(event.currentTarget)}
              sx={{
                ...checkActionSx,
                borderLeft: "1px solid color-mix(in srgb, var(--accent-on-solid) 32%, transparent)",
                minHeight: 40,
                minWidth: 34,
                paddingX: 0.75,
              }}
            >
              <CaretDown aria-hidden size={13} weight="bold" />
            </MuiButton>
          </ButtonGroup>
        </ProjectReadOnlyTooltip>
      ) : null}
      {canUpdateKeyword ? (
        <ProjectReadOnlyTooltip>
          <Button
            disabled={readOnly || !canCreateAlert || alertCreating || alertCreated}
            onClick={onCreateAlert}
            startIcon={<AlertIcon size={15} weight={alertCreated ? "fill" : "bold"} />}
            sx={
              alertCreated
                ? { border: "1px solid var(--accent-solid)", color: "var(--accent-text)" }
                : { color: "var(--fg-muted)" }
            }
            variant="secondary"
          >
            {alertLabel}
          </Button>
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
        <DotsThree aria-hidden size={17} weight="bold" />
      </Button>
      {canUpdateKeyword && showCheck ? (
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
              option={{ label: depthOptionLabel(depth, providerRate), value: String(depth) }}
            />
          ))}
        </Menu>
      ) : null}
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
              label: editing ? "Close markets & devices" : "Manage markets & devices",
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
