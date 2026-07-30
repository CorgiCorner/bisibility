"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeProvider";
import { MenuSelectOptionItem, menuSelectPaperSx } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Menu from "@mui/material/Menu";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretDownIcon as CaretDown,
} from "@phosphor-icons/react";
import { useState } from "react";
import { neutralActionSx } from "./bulk-action-styles";
import { effectiveRowDepth, selectionDepthLabel } from "./run-check-depth";

type RunChecksSplitButtonProps = {
  checksRunning: boolean;
  onRunChecks: (keywordIds: string[], depth?: SerpDepth) => void;
  readOnly: boolean;
  selectedRows: KeywordRow[];
};

export function RunChecksSplitButton({
  checksRunning,
  onRunChecks,
  readOnly,
  selectedRows,
}: Readonly<RunChecksSplitButtonProps>) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const selectedIds = selectedRows.map((row) => row.id);
  const selectionLabel = selectionDepthLabel(selectedRows);
  const selectionDepths = new Set(selectedRows.map(effectiveRowDepth));
  const uniformDepth = selectionDepths.size === 1 ? selectionDepths.values().next().value : null;
  const actionLabel = selectedRows.length === 1 ? "Run check" : "Run checks";
  const disabled = readOnly || checksRunning;

  return (
    <>
      <ProjectReadOnlyTooltip>
        <ButtonGroup size="small" variant="outlined">
          <Button
            color="inherit"
            disabled={disabled}
            onClick={() => onRunChecks(selectedIds)}
            startIcon={
              <ArrowsClockwise className={checksRunning ? "animate-spin" : ""} size={15} />
            }
            sx={neutralActionSx}
          >
            {checksRunning ? "Starting..." : `${actionLabel} (${selectionLabel})`}
          </Button>
          <Button
            aria-label="Choose check depth"
            color="inherit"
            disabled={disabled}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            sx={{ ...neutralActionSx, minWidth: 34, paddingX: 0.75 }}
          >
            <CaretDown aria-hidden size={13} weight="bold" />
          </Button>
        </ButtonGroup>
      </ProjectReadOnlyTooltip>
      <Menu
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        open={Boolean(menuAnchor)}
        slotProps={{
          list: { "aria-label": "Check depth", dense: true, sx: { padding: 0 } },
          paper: { sx: menuSelectPaperSx },
        }}
      >
        {serpDepthValues.map((depth) => (
          <MenuSelectOptionItem
            current={depth === uniformDepth}
            key={depth}
            onSelect={() => {
              onRunChecks(selectedIds, depth);
              setMenuAnchor(null);
            }}
            option={{ label: `Top ${depth}`, value: String(depth) }}
          />
        ))}
      </Menu>
    </>
  );
}
