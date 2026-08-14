"use client";

import { WorkspaceTile } from "@/components/shell/WorkspaceTile";
import { workspaceRowMeta } from "@/components/shell/workspace-labels";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import MenuItem from "@mui/material/MenuItem";
import { CheckIcon as Check } from "@phosphor-icons/react";
import Link from "next/link";

/** Shared by workspace rows and the settings/create actions below the separator. */
export const MENU_ROW_SX = {
  alignItems: "center",
  borderRadius: "9px",
  fontSize: "13px",
  fontWeight: 500,
  gap: "10px",
  // Rows are rounded, so without a gap their hover fills butt against each other and read
  // as one block with seams rather than separate targets. All 4px sit on one side: the rows
  // are block-level list items, so a 2px/2px split would collapse back to 2px.
  marginBottom: "4px",
  minHeight: 0,
  paddingX: "9px",
  paddingY: "8px",
  // The fill belongs to the pointer alone; selection is the check glyph, never a fill.
  "&:hover": { backgroundColor: "var(--nav-active)" },
  "&.Mui-focusVisible": { backgroundColor: "var(--nav-active)" },
  "&:active": { backgroundColor: "var(--bg-inset)" },
  "&.Mui-selected": { backgroundColor: "transparent" },
} as const;

export type WorkspaceRowProps = {
  workspace: WorkspaceSummary;
  active: boolean;
  onSelect: () => void;
};

export function WorkspaceRow({ workspace, active, onSelect }: Readonly<WorkspaceRowProps>) {
  return (
    <MenuItem
      aria-current={active ? "true" : undefined}
      component={Link}
      href={appPath(workspace.publicId, "dashboard")}
      onClick={onSelect}
      sx={MENU_ROW_SX}
    >
      <WorkspaceTile domain={workspace.domain} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-tight text-fg">
          <span className="truncate">{workspace.name}</span>
          {workspace.isSample ? (
            <span className="rounded-full border border-border-strong px-1.5 py-px font-mono text-[9px] uppercase text-fg-muted">
              Sample
            </span>
          ) : null}
        </span>
        <span className="mt-px block font-mono text-[10px] text-fg-muted">
          {workspaceRowMeta(workspace)}
        </span>
      </span>
      {/* Kept in the DOM on every row and toggled with visibility, so opening the menu never
          relayouts the rows. --accent-solid, not --accent: the check is a non-text indicator
          (SC 1.4.11 wants 3:1) and --accent lands at 2.97:1 on the menu surface in light.
          Same rule as the nav dot. */}
      <Check
        aria-hidden
        className="flex-none text-accent-solid"
        size={16}
        style={{ visibility: active ? "visible" : "hidden" }}
        weight="bold"
      />
    </MenuItem>
  );
}
