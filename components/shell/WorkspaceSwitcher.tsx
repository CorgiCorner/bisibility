"use client";

import { MENU_ROW_SX, WorkspaceRow } from "@/components/shell/WorkspaceRow";
import {
  WorkspaceSwitcherTrigger,
  type WorkspaceTriggerVariant,
} from "@/components/shell/WorkspaceSwitcherTrigger";
import { workspaceSublabel } from "@/components/shell/workspace-labels";
import {
  estimateWorkspaceMenuHeight,
  resolveWorkspaceMenuPlacement,
  WORKSPACE_MENU_WIDTH,
  type WorkspaceMenuPlacement,
  workspaceMenuOrigins,
} from "@/components/shell/workspace-menu-placement";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef, useState } from "react";

const MENU_ID = "workspace-switcher-menu";

const PAPER_SX = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  boxShadow: "0 14px 38px rgba(20, 16, 8, 0.16)",
  color: "var(--fg)",
  padding: "6px",
  width: WORKSPACE_MENU_WIDTH,
} as const;

const DIVIDER_SX = { borderColor: "var(--border)", marginX: "2px", marginY: "4px" } as const;

export type WorkspaceSwitcherProps = {
  activeProjectId: string;
  canCreateWorkspace: boolean;
  collapsed?: boolean;
  /** `ghost` (default) is transparent until hover; `boxed` sits on its own elevated card. */
  variant?: WorkspaceTriggerVariant;
  workspaces: WorkspaceSummary[];
};

export function WorkspaceSwitcher({
  activeProjectId,
  canCreateWorkspace,
  collapsed = false,
  variant = "ghost",
  workspaces,
}: Readonly<WorkspaceSwitcherProps>) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [placement, setPlacement] = useState<WorkspaceMenuPlacement>("up");
  // Last rendered menu height. A plain ref written from a callback ref, so the flip needs no
  // effect: the open handler reads a real measurement from the previous render.
  const menuHeightRef = useRef(0);
  // Collapsed, the menu hangs off the rail column, not off the 36px button inside it, so
  // "beside the rail" clears the whole 80px strip instead of the button's own right edge.
  const railRef = useRef<HTMLDivElement>(null);
  const open = Boolean(anchorEl);

  const activeIndex = Math.max(
    0,
    workspaces.findIndex((w) => w.id === activeProjectId),
  );
  const active = workspaces[activeIndex];
  const actionCount = canCreateWorkspace ? 2 : 1;

  function openMenu(event: React.MouseEvent<HTMLButtonElement>) {
    const trigger = event.currentTarget;
    const menuHeight =
      menuHeightRef.current || estimateWorkspaceMenuHeight(workspaces.length, actionCount);
    setPlacement(resolveWorkspaceMenuPlacement(trigger.getBoundingClientRect().top, menuHeight));
    setAnchorEl((collapsed ? railRef.current : null) ?? trigger);
  }

  function close() {
    setAnchorEl(null);
  }

  function measureMenu(node: HTMLElement | null) {
    if (node) {
      menuHeightRef.current = node.offsetHeight;
    }
  }

  const { anchorOrigin, offset, transformOrigin } = workspaceMenuOrigins(collapsed, placement);
  const sublabel = active ? workspaceSublabel(active) : null;

  return (
    // The switcher now sits at the foot of the rail, so its 18px of breathing room moved from
    // below it to above it.
    <div className="relative mt-4.5 flex-none" ref={railRef}>
      <WorkspaceSwitcherTrigger
        collapsed={collapsed}
        domain={active?.domain ?? ""}
        menuId={MENU_ID}
        name={active?.name ?? "Project"}
        onOpen={openMenu}
        open={open}
        sublabel={sublabel}
        variant={variant}
      />
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={anchorOrigin}
        // Don't restore focus to the trigger on close: a mouse-opened menu otherwise
        // leaves a lingering focus-visible ring on the switcher after it closes.
        disableRestoreFocus
        id={MENU_ID}
        onClose={close}
        open={open}
        slotProps={{
          list: { "aria-label": "Projects", dense: true, sx: { padding: 0 } },
          paper: { ref: measureMenu, sx: { ...PAPER_SX, ...offset } },
        }}
        transformOrigin={transformOrigin}
      >
        <div className="px-[9px] pb-[7px] pt-[10px] font-mono text-[9.5px] uppercase tracking-[0.6px] text-fg-muted">
          Projects
        </div>
        {workspaces.map((workspace) => (
          <WorkspaceRow
            active={workspace.id === activeProjectId}
            key={workspace.id}
            onSelect={close}
            workspace={workspace}
          />
        ))}
        {/* No settings row: the rail already has Settings, and it points at the same screen.
            The switcher is for changing workspace, not a second way into the same page. */}
        {canCreateWorkspace ? <Divider sx={DIVIDER_SX} /> : null}
        {canCreateWorkspace ? (
          <MenuItem component={Link} href="/onboarding?new=1" onClick={close} sx={MENU_ROW_SX}>
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-dashed border-border-strong text-fg-muted">
              <Plus aria-hidden size={14} weight="bold" />
            </span>
            <span className="text-fg">Create project</span>
          </MenuItem>
        ) : null}
      </Menu>
    </div>
  );
}
