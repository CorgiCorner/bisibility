"use client";

import {
  bulkBarButtonSx,
  outlinedSplitChromeSx,
} from "@/components/keywords/grid/bulk-action-styles";
import { MenuSelectOptionItem, menuSelectPaperSx } from "@/components/ui";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
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
  const compact = size === "xs";
  const buttonSx = splitButtonSx(size);
  const heightClass = compact ? "min-h-[30px]" : "min-h-[36px]";

  return (
    <span className="inline-flex">
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
          startIcon={<ArrowsClockwise className={spinning ? "animate-spin" : ""} size={15} />}
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
          <CaretDown aria-hidden size={13} weight="bold" />
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
      </Menu>
    </span>
  );
}
