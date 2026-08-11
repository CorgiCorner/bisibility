"use client";

import { MenuSelectOptionItem, menuSelectPaperSx } from "@/components/ui";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Menu from "@mui/material/Menu";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import { useId, useState } from "react";

export type KeywordDetailCheckDepthOption = {
  label: string;
  price: string;
  value: string;
};

export type KeywordDetailCheckSplitButtonProps = {
  actionLabel: string;
  caretAriaLabel?: string;
  disabled?: boolean;
  onAction: () => void;
  onDepthChange: (value: string) => void;
  options: readonly KeywordDetailCheckDepthOption[];
  selectedValue: string;
  trackingDepthLabel: string;
};

const actionSx = {
  backgroundColor: "var(--accent-solid)",
  borderColor: "var(--accent-solid)",
  color: "var(--accent-on-solid)",
  minHeight: 40,
  textTransform: "none",
  "&:hover": {
    backgroundColor: "var(--accent-solid-hover)",
    borderColor: "var(--accent-solid-hover)",
  },
} as const;

export function KeywordDetailCheckSplitButton({
  actionLabel,
  caretAriaLabel = "Choose check depth",
  disabled = false,
  onAction,
  onDepthChange,
  options,
  selectedValue,
  trackingDepthLabel,
}: Readonly<KeywordDetailCheckSplitButtonProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuId = `keyword-detail-check-depth-${useId()}`;
  const open = Boolean(anchorEl);

  function closeMenu() {
    setAnchorEl(null);
  }

  return (
    <>
      <ButtonGroup aria-label={actionLabel} variant="contained">
        <Button disabled={disabled} onClick={onAction} sx={actionSx} type="button">
          {actionLabel}
        </Button>
        <Button
          aria-controls={menuId}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={caretAriaLabel}
          disabled={disabled}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          sx={{ ...actionSx, minWidth: 40, paddingX: 0.75 }}
          type="button"
        >
          <CaretDown aria-hidden size={13} weight="bold" />
        </Button>
      </ButtonGroup>
      <Menu
        anchorEl={anchorEl}
        id={menuId}
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": "Check depth", dense: true, sx: { padding: 0 } },
          paper: { sx: menuSelectPaperSx },
        }}
      >
        <div className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          Check depth
        </div>
        {options.map((option) => (
          <MenuSelectOptionItem
            current={option.value === selectedValue}
            key={option.value}
            onSelect={() => {
              onDepthChange(option.value);
              closeMenu();
            }}
            option={{ label: option.label, secondary: option.price, value: option.value }}
          />
        ))}
        <p className="m-0 border-border-soft border-t px-3 pb-2 pt-2 text-[12px] leading-[1.45] text-fg-muted">
          One-time check - tracking stays at {trackingDepthLabel}.
        </p>
      </Menu>
    </>
  );
}
