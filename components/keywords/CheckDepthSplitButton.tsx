"use client";

import {
  bulkBarButtonSx,
  outlinedSplitChromeSx,
} from "@/components/keywords/grid/bulk-action-styles";
import { settingsSectionHref } from "@/components/settings/shell/settings-sections";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import {
  Button as DesignButton,
  MenuActionFooter,
  MenuSelectOptionItem,
  menuSelectPaperSx,
} from "@/components/ui";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
import { VISIBILITY_HORIZON, VISIBILITY_SHALLOW_CHECK_COPY } from "@/lib/visibility/definition";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Menu from "@mui/material/Menu";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretDownIcon as CaretDown,
} from "@phosphor-icons/react";
import { useState } from "react";

export type CheckDepthSplitButtonSize = "md" | "xs";

type CheckDepthSplitButtonProps = {
  actionLabel: string;
  caretAriaLabel?: string;
  currentDepth: SerpDepth | null;
  disabled?: boolean;
  onAction: () => void;
  onDepthChange: (depth: SerpDepth) => void;
  optionLabel?: (depth: SerpDepth) => string;
  size?: CheckDepthSplitButtonSize;
  spinning?: boolean;
};

const caretSx = { minWidth: 34, paddingX: 0.75 } as const;

function splitButtonSx(size: CheckDepthSplitButtonSize) {
  if (size === "xs") return bulkBarButtonSx;
  return { ...outlinedSplitChromeSx, minHeight: 36 };
}

export function CheckDepthSplitButton({
  actionLabel,
  caretAriaLabel = "Choose check depth",
  currentDepth,
  disabled = false,
  onAction,
  onDepthChange,
  optionLabel = (depth) => `Top ${depth}`,
  size = "md",
  spinning = false,
}: Readonly<CheckDepthSplitButtonProps>) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { projectRef } = useProjectWriteMode();
  const compact = size === "xs";
  const buttonSx = splitButtonSx(size);
  const heightClass = compact ? "min-h-[30px]" : "min-h-[36px]";

  return (
    <span className="inline-flex items-center gap-2">
      <ButtonGroup
        size={compact ? "small" : "medium"}
        sx={compact ? { height: 30 } : undefined}
        variant="outlined"
      >
        <Button
          className={heightClass}
          color="inherit"
          disabled={disabled}
          onClick={onAction}
          startIcon={
            <ArrowsClockwise
              weight="regular"
              className={spinning ? "animate-spin" : ""}
              size={15}
            />
          }
          sx={buttonSx}
        >
          {actionLabel}
        </Button>
        <Button
          aria-label={caretAriaLabel}
          className={heightClass}
          color="inherit"
          disabled={disabled}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          sx={{ ...buttonSx, ...caretSx }}
        >
          <CaretDown aria-hidden size={13} weight="regular" />
        </Button>
      </ButtonGroup>
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
            current={depth === currentDepth}
            key={depth}
            onSelect={() => {
              onDepthChange(depth);
              setMenuAnchor(null);
            }}
            option={{ label: optionLabel(depth), value: String(depth) }}
          />
        ))}
        {projectRef ? (
          <MenuActionFooter>
            <DesignButton
              className="w-full"
              href={settingsSectionHref(projectRef, "tracking")}
              size="xs"
              variant="secondary"
            >
              Change default
            </DesignButton>
          </MenuActionFooter>
        ) : null}
      </Menu>
      {currentDepth !== null && currentDepth < VISIBILITY_HORIZON ? (
        <span className="max-w-56 text-xs leading-relaxed text-yellow-text">
          {VISIBILITY_SHALLOW_CHECK_COPY}
        </span>
      ) : null}
    </span>
  );
}
