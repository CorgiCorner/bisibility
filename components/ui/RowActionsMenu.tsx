"use client";

import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { menuSelectPaperStyle } from "@/components/ui/MenuSelect";
import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { type KeyboardEvent as ReactKeyboardEvent, useId, useState } from "react";

export type RowActionItem = {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
};

type RowActionsMenuProps = {
  ariaLabel: string;
  items: readonly RowActionItem[];
};

export function RowActionsMenu({ ariaLabel, items }: Readonly<RowActionsMenuProps>) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchor);
  const menuId = useId();

  function closeMenu() {
    setAnchor(null);
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    setAnchor(event.currentTarget);
  }

  return (
    <>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className="grid h-[30px] w-[30px] flex-none place-items-center rounded-control border border-border bg-bg-elev text-fg-muted hover:bg-surface-hover hover:text-fg"
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <DotsThree aria-hidden size={16} weight="regular" />
      </button>
      <Menu
        id={menuId}
        onClick={(event) => event.stopPropagation()}
        anchorEl={anchor}
        onClose={closeMenu}
        open={open}
        listProps={{ "aria-label": ariaLabel, style: { padding: 0 } }}
        contentProps={{ style: { ...menuSelectPaperStyle, minWidth: 194 } }}
      >
        {items.map((item) => (
          <MenuItem
            className={cn(item.danger && "text-red-text")}
            disabled={item.disabled}
            key={item.label}
            onClick={() => {
              closeMenu();
              item.onSelect();
            }}
            style={{
              borderRadius: UI_RADIUS_ROLES.control,
              "--control-color": item.danger ? "var(--red-text)" : "var(--fg)",
              fontSize: "12.5px",
              minHeight: 32,
              paddingLeft: "9px",
              paddingRight: "9px",
              "--control-hover-background-color": "var(--surface-hover)",
              "--control-focus-background-color": "var(--surface-hover)",
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
