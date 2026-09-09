"use client";

import { Button } from "@/components/ui/Button";
import { ButtonGroup } from "@/components/ui/ButtonGroup";
import { Menu } from "@/components/ui/Menu";
import { menuSelectPaperStyle } from "@/components/ui/MenuSelect";
import { MenuSelectOptionItem } from "@/components/ui/MenuSelectOptionItem";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
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

const actionStyle = {
  "--control-background-color": "var(--accent-solid)",
  "--control-border-color": "var(--accent-solid)",
  "--control-color": "var(--accent-on-solid)",
  minHeight: 40,
  textTransform: "none",
  "--control-hover-background-color": "var(--accent-solid-hover)",
  "--control-hover-border-color": "var(--accent-solid-hover)",
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
      <ButtonGroup aria-label={actionLabel}>
        <Button disabled={disabled} onClick={onAction} style={actionStyle} type="button">
          {actionLabel}
        </Button>
        <Button
          aria-controls={menuId}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={caretAriaLabel}
          disabled={disabled}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          style={{ ...actionStyle, minWidth: 40, paddingLeft: 6, paddingRight: 6 }}
          type="button"
        >
          <CaretDown aria-hidden size={13} weight="regular" />
        </Button>
      </ButtonGroup>
      <Menu
        anchorEl={anchorEl}
        id={menuId}
        onClose={closeMenu}
        open={open}
        listProps={{ "aria-label": "Check depth", style: { padding: 0 } }}
        contentProps={{ style: menuSelectPaperStyle }}
      >
        <div className="px-3 pb-1 pt-2 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
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
        <p className="m-0 border-border border-t px-3 pb-2 pt-2 text-[12px] leading-[1.45] text-fg-muted">
          One-time check - tracking stays at {trackingDepthLabel}.
        </p>
      </Menu>
    </>
  );
}
