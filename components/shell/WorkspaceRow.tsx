"use client";

import { WorkspaceTile } from "@/components/shell/WorkspaceTile";
import { truncateProjectName, workspaceRowMeta } from "@/components/shell/workspace-labels";
import { MenuItem } from "@/components/ui/MenuItem";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { menuItemRowHoverStyle } from "@/lib/ui/menu-item-row-styles";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import Link from "next/link";

/** Shared by workspace rows and the settings/create actions below the separator. */
export const MENU_ROW_STYLE = {
  alignItems: "center",
  borderRadius: UI_RADIUS_ROLES.control,
  fontSize: "13px",
  fontWeight: 500,
  gap: "10px",
  marginBottom: "4px",
  minHeight: 0,
  paddingLeft: "9px",
  paddingRight: "9px",
  paddingTop: "8px",
  paddingBottom: "8px",
  // The fill belongs to the pointer alone; selection is the check glyph, never a fill.
  ...menuItemRowHoverStyle,
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
      style={MENU_ROW_STYLE}
    >
      <WorkspaceTile domain={workspace.domain} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-tight text-fg">
          <span className="truncate">{truncateProjectName(workspace.name)}</span>
          {workspace.isSample ? (
            <span className="rounded-full border border-border px-1.5 py-px text-[9px] uppercase text-fg-muted">
              Sample
            </span>
          ) : null}
        </span>
        <span className="mt-px block text-[10px] text-fg-muted">{workspaceRowMeta(workspace)}</span>
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
        weight="regular"
      />
    </MenuItem>
  );
}
