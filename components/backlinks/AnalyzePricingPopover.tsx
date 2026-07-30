"use client";

import Popover from "@mui/material/Popover";

type AnalyzePricingPopoverProps = {
  anchor: HTMLElement | null;
  onClose: () => void;
};

const rows = [
  ["Profile summary, new & lost", "$0.02"],
  ["12-month history", "$0.02"],
  ["Link rows", "$0.01 / 100"],
  ["Loading more rows later", "$0.01 / 100"],
] as const;

export function AnalyzePricingPopover({ anchor, onClose }: Readonly<AnalyzePricingPopoverProps>) {
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
            border: "1px solid var(--border-strong)",
            borderRadius: "10px",
            boxShadow: "none",
            marginTop: "10px",
          },
        },
      }}
      transformOrigin={{ horizontal: "right", vertical: "top" }}
    >
      <div className="w-[330px] max-w-[calc(100vw-32px)] p-4 text-fg">
        <p className="mb-2.5 mt-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
          Cost per part
        </p>
        <div>
          {rows.map(([label, cost], index) => (
            <div
              className={
                index === rows.length - 1
                  ? "flex justify-between py-[5px] text-[13px] text-fg-muted"
                  : "flex justify-between border-b border-border py-[5px] text-[13px]"
              }
              key={label}
            >
              <span>{label}</span>
              <span className="font-mono">{cost}</span>
            </div>
          ))}
        </div>
        <p className="mb-0 mt-2.5 border-t border-border pt-2.5 text-[12.5px] leading-[1.55] text-fg-muted">
          Charged by DataForSEO to your own account. A snapshot stays cached for 24 hours -
          reopening or switching tabs within it is free.
        </p>
      </div>
    </Popover>
  );
}
