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
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

const MENU_ID = "workspace-switcher-menu";

const PAPER_SX = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border-control)",
  borderRadius: UI_RADIUS_ROLES.card,
  boxShadow: "none",
  color: "var(--fg)",
  maxWidth: "calc(100vw - 16px)",
  padding: "6px",
  width: WORKSPACE_MENU_WIDTH,
} as const;

const DIVIDER_SX = { borderColor: "var(--border)", marginX: "-6px", marginY: "4px" } as const;

type WorkspaceSearchHeaderProps = {
  inputRef: (node: HTMLInputElement | null) => void;
  onSearchChange: (value: string) => void;
  search: string;
};

function WorkspaceSearchHeader({
  inputRef,
  onSearchChange,
  search,
}: Readonly<WorkspaceSearchHeaderProps>) {
  return (
    <div className="-mx-1.5 -mt-1.5 mb-1.5 flex h-10 items-center gap-2 border-border border-b px-3">
      <input
        aria-label="Find project"
        className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-fg outline-none placeholder:text-fg-muted [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => onSearchChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") event.stopPropagation();
        }}
        placeholder="Find project..."
        ref={inputRef}
        type="search"
        value={search}
      />
      <kbd className="flex-none rounded-control border border-border-control px-1.5 py-0.5 font-mono text-[9px] text-fg-muted">
        Esc
      </kbd>
    </div>
  );
}
WorkspaceSearchHeader.muiSkipListHighlight = true;

export type WorkspaceSwitcherProps = {
  activeProjectId: string;
  /** Compact header triggers omit the keyword-count sublabel. */
  collapsed?: boolean;
  compact?: boolean;
  canCreateWorkspace: boolean;
  className?: string;
  /** `ghost` (default) is transparent until hover; `boxed` sits on its own elevated card. */
  variant?: WorkspaceTriggerVariant;
  workspaces: WorkspaceSummary[];
};

export function WorkspaceSwitcher({
  activeProjectId,
  canCreateWorkspace,
  className,
  collapsed = false,
  compact = false,
  variant = "ghost",
  workspaces,
}: Readonly<WorkspaceSwitcherProps>) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [placement, setPlacement] = useState<WorkspaceMenuPlacement>("up");
  const [search, setSearch] = useState("");
  // Last rendered menu height. A plain ref written from a callback ref, so the flip needs no
  // effect: the open handler reads a real measurement from the previous render.
  const menuHeightRef = useRef(0);
  const open = Boolean(anchorEl);
  const focusSearch = useCallback(
    (node: HTMLInputElement | null) => {
      if (node && open) node.focus();
    },
    [open],
  );

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
    setAnchorEl(trigger);
  }

  function close() {
    setSearch("");
    setAnchorEl(null);
  }

  function onTriggerClick(event: React.MouseEvent<HTMLButtonElement>) {
    // Same-tick backdropClick already scheduled close(); stale `anchorEl` still
    // looks open, so treating this as a toggle closes instead of opening again.
    if (anchorEl) {
      close();
      return;
    }
    openMenu(event);
  }

  function measureMenu(node: HTMLElement | null) {
    if (node) {
      menuHeightRef.current = node.offsetHeight;
    }
  }

  const { anchorOrigin, offset, transformOrigin } = workspaceMenuOrigins(false, placement);
  const sublabel = compact || !active ? null : workspaceSublabel(active);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleWorkspaces = normalizedSearch
    ? workspaces.filter(
        (workspace) =>
          workspace.name.toLocaleLowerCase().includes(normalizedSearch) ||
          workspace.domain.toLocaleLowerCase().includes(normalizedSearch),
      )
    : workspaces;

  return (
    // The switcher follows the brand, so a 12px gap keeps the two controls grouped without
    // competing with the navigation below.
    <div className={`relative ${compact ? "" : "w-full"} flex-none ${className ?? "mt-3"}`}>
      <WorkspaceSwitcherTrigger
        collapsed={collapsed}
        compact={compact}
        domain={active?.domain ?? ""}
        menuId={MENU_ID}
        name={active?.name ?? "Project"}
        onOpen={onTriggerClick}
        open={open}
        sublabel={sublabel}
        variant={variant}
      />
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={anchorOrigin}
        // Don't restore focus to the trigger on close: a mouse-opened menu otherwise
        // leaves a lingering focus-visible ring on the switcher after it closes.
        autoFocus={false}
        disableAutoFocusItem
        disableRestoreFocus
        id={MENU_ID}
        onClose={close}
        open={open}
        slotProps={{
          list: { "aria-label": "Projects", dense: true, sx: { padding: 0 } },
          paper: { ref: measureMenu, sx: { ...PAPER_SX, ...offset } },
        }}
        transformOrigin={transformOrigin}
        // Instant: Slide/Grow reads as the menu flying out of the rail.
        transitionDuration={0}
      >
        <WorkspaceSearchHeader inputRef={focusSearch} onSearchChange={setSearch} search={search} />
        {visibleWorkspaces.map((workspace) => (
          <WorkspaceRow
            active={workspace.id === activeProjectId}
            key={workspace.id}
            onSelect={close}
            workspace={workspace}
          />
        ))}
        {visibleWorkspaces.length === 0 ? (
          <p className="m-0 px-[9px] py-3 text-[12px] leading-relaxed text-fg-muted">
            Projects you create and join appear here for quick context switching.
          </p>
        ) : null}
        {/* No settings row: the rail already has Settings, and it points at the same screen.
            The switcher is for changing workspace, not a second way into the same page. */}
        {canCreateWorkspace ? <Divider sx={DIVIDER_SX} /> : null}
        {canCreateWorkspace ? (
          <MenuItem
            aria-label="Create project"
            component={Link}
            href="/onboarding?new=1"
            onClick={close}
            sx={MENU_ROW_SX}
          >
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-control text-fg-muted">
              <Plus aria-hidden size={14} weight="regular" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium leading-tight text-fg">
                Create project
              </span>
              <span className="mt-px block font-mono text-[10px] text-fg-muted">
                Collaborate with others in a new project
              </span>
            </span>
          </MenuItem>
        ) : null}
      </Menu>
    </div>
  );
}
