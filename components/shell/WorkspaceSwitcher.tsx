"use client";

import { WorkspaceRow } from "@/components/shell/WorkspaceRow";
import { workspaceSublabel, workspaceVisual } from "@/components/shell/workspace-visuals";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import {
  CaretUpDownIcon as CaretUpDown,
  GearSixIcon as GearSix,
  GlobeSimpleIcon as GlobeSimple,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

const PAPER_SX = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "6px",
  padding: "6px",
} as const;

const ROW_SX = {
  borderRadius: "9px",
  color: "var(--fg-muted)",
  fontSize: "13px",
  gap: "10px",
  minHeight: 0,
  paddingX: "9px",
  paddingY: "8px",
  "&:hover": { backgroundColor: "var(--nav-active)" },
  "&.Mui-focusVisible": { backgroundColor: "var(--nav-active)" },
} as const;

const DIVIDER_SX = { borderColor: "var(--border)", marginX: "4px", marginY: "6px" } as const;

function paperSx(collapsed: boolean, anchorEl: HTMLElement | null) {
  return {
    ...PAPER_SX,
    marginLeft: collapsed ? "10px" : 0,
    marginTop: collapsed ? 0 : PAPER_SX.marginTop,
    width: collapsed ? 248 : (anchorEl?.offsetWidth ?? 248),
  };
}

export type WorkspaceSwitcherProps = {
  activeProjectId: string;
  canCreateWorkspace: boolean;
  collapsed?: boolean;
  workspaces: WorkspaceSummary[];
};

export function WorkspaceSwitcher({
  activeProjectId,
  canCreateWorkspace,
  collapsed = false,
  workspaces,
}: Readonly<WorkspaceSwitcherProps>) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const activeIndex = Math.max(
    0,
    workspaces.findIndex((w) => w.id === activeProjectId),
  );
  const active = workspaces[activeIndex];
  const TriggerIcon = active ? workspaceVisual(activeIndex).Icon : GlobeSimple;

  function close() {
    setAnchorEl(null);
  }

  return (
    <div className="relative mb-[14px]">
      <Tooltip placement="right" title={collapsed ? "Switch workspace" : ""}>
        <button
          aria-controls={open ? "workspace-switcher-menu" : undefined}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Switch workspace"
          className={[
            "group flex w-full items-center rounded-[10px] text-left text-fg outline-none transition-colors",
            collapsed
              ? "justify-center border border-transparent bg-transparent px-0 py-2.5"
              : "gap-2.5 border border-border-strong bg-bg-elev px-[11px] py-2.5 hover:bg-bg-sunken focus-visible:border-accent",
          ].join(" ")}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          type="button"
        >
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-accent-soft text-accent">
            <TriggerIcon aria-hidden size={14} weight="bold" />
          </span>
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight">
                  {active?.name ?? "Workspace"}
                </span>
                <span className="block font-mono text-[10px] text-fg-faint">
                  {active ? workspaceSublabel(active) : "New workspace"}
                </span>
              </span>
              <CaretUpDown aria-hidden className="text-fg-faint" size={13} weight="bold" />
            </>
          )}
        </button>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={
          collapsed
            ? { horizontal: "right", vertical: "top" }
            : { horizontal: "left", vertical: "bottom" }
        }
        // Don't restore focus to the trigger on close: a mouse-opened menu otherwise
        // leaves a lingering focus-visible ring on the switcher after it closes.
        disableRestoreFocus
        id="workspace-switcher-menu"
        onClose={close}
        open={open}
        slotProps={{
          list: { "aria-label": "Workspaces", dense: true, sx: { padding: 0 } },
          paper: { sx: paperSx(collapsed, anchorEl) },
        }}
        transformOrigin={{ horizontal: "left", vertical: "top" }}
      >
        <div className="px-[9px] pb-[5px] pt-[7px] font-mono text-[9.5px] uppercase tracking-[0.6px] text-fg-faint">
          Workspaces
        </div>
        {workspaces.map((workspace, index) => (
          <WorkspaceRow
            active={workspace.id === activeProjectId}
            index={index}
            key={workspace.id}
            onSelect={close}
            workspace={workspace}
          />
        ))}
        <Divider sx={DIVIDER_SX} />
        {canCreateWorkspace ? (
          <MenuItem component={Link} href="/onboarding?new=1" onClick={close} sx={ROW_SX}>
            <span className="grid h-7 w-7 flex-none place-items-center rounded-lg border border-dashed border-border-strong text-fg-muted">
              <Plus aria-hidden size={14} weight="bold" />
            </span>
            <span className="text-[13px] font-semibold text-fg">Create workspace</span>
          </MenuItem>
        ) : null}
        <MenuItem
          component={Link}
          href={active ? appPath(active.publicId, "settings") : "/onboarding"}
          onClick={close}
          sx={ROW_SX}
        >
          <span className="grid h-7 w-7 flex-none place-items-center text-fg-faint">
            <GearSix aria-hidden size={15} weight="bold" />
          </span>
          <span className="text-[13px] font-medium text-fg">Settings</span>
        </MenuItem>
      </Menu>
    </div>
  );
}
