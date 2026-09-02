"use client";

import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import Popover from "@mui/material/Popover";
import type { ReactNode } from "react";

export type PricingRow = { label: string; value: string };

export type PricingPopoverProps = {
  anchor: HTMLElement | null;
  eyebrow?: string;
  footer: ReactNode;
  onClose: () => void;
  rows: readonly PricingRow[];
};

export function PricingPopover({
  anchor,
  eyebrow = "Provider cost",
  footer,
  onClose,
  rows,
}: Readonly<PricingPopoverProps>) {
  return (
    <Popover
      anchorEl={anchor}
      anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      onClose={onClose}
      open={Boolean(anchor)}
      slotProps={{
        paper: {
          sx: {
            backgroundColor: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: UI_RADIUS_ROLES.control,
            boxShadow: "none",
            marginTop: "10px",
          },
        },
      }}
      transformOrigin={{ horizontal: "right", vertical: "top" }}
    >
      <div className="w-[330px] max-w-[calc(100vw-32px)] p-4 text-fg">
        <p className="mb-2.5 mt-0 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
          {eyebrow}
        </p>
        <div className="divide-y divide-border">
          {rows.map((row, index) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-[5px] text-[13px]"
              // Callers build rows from a rate card, so two rows can legitimately carry the
              // same label; index keys keep that from colliding on a static per-render list.
              key={`${index}-${row.label}`}
            >
              <span>{row.label}</span>
              <span className="whitespace-nowrap text-right text-fg-muted tabular-nums">
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <div className="mb-0 mt-2.5 border-t border-border pt-2.5 text-[12.5px] leading-[1.55] text-fg-muted">
          {footer}
        </div>
      </div>
    </Popover>
  );
}

export const pricingTriggerClassName =
  "whitespace-nowrap text-[12.5px] text-fg-muted decoration-border-control underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:underline";
