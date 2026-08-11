"use client";

import { menuSelectPaperSx } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react";
import { useState } from "react";

export type DeveloperActionItem = {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
};

type DeveloperActionsMenuProps = {
  ariaLabel: string;
  items: readonly DeveloperActionItem[];
};

export function DeveloperActionsMenu({ ariaLabel, items }: Readonly<DeveloperActionsMenuProps>) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchor);

  function closeMenu() {
    setAnchor(null);
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[7px] border border-border bg-bg-elev text-fg-muted hover:bg-surface-hover hover:text-fg"
        onClick={(event) => setAnchor(event.currentTarget)}
        type="button"
      >
        <DotsThree aria-hidden size={16} weight="bold" />
      </button>
      <Menu
        anchorEl={anchor}
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": ariaLabel, dense: true, sx: { padding: 0 } },
          paper: { sx: { ...menuSelectPaperSx, minWidth: 194 } },
        }}
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
            sx={{
              borderRadius: "7px",
              color: item.danger ? "var(--red-text)" : "var(--fg)",
              fontSize: "12.5px",
              minHeight: 32,
              paddingX: "9px",
              "&:hover, &.Mui-focusVisible": { backgroundColor: "var(--surface-hover)" },
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
