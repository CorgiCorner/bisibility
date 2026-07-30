"use client";

import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import { XIcon as X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type AppDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AppDrawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: Readonly<AppDrawerProps>) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      transitionDuration={{ enter: 340, exit: 280 }}
      slotProps={{
        paper: {
          sx: {
            backgroundColor: "var(--bg-elev)",
            borderLeft: "1px solid var(--border-strong)",
            boxShadow: "none",
            color: "var(--fg)",
            maxWidth: "94vw",
            width: 560,
          },
        },
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="m-0 text-[18px] font-semibold leading-tight">{title}</h2>
            {description ? (
              <p className="m-0 mt-1 text-[13px] leading-normal text-fg-muted">{description}</p>
            ) : null}
          </div>
          <IconButton aria-label="Close drawer" onClick={onClose} size="small">
            <X size={18} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <footer className="border-t border-border p-4">{footer}</footer> : null}
      </div>
    </Drawer>
  );
}
