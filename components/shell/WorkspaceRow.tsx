"use client";

import { workspaceRowMeta, workspaceVisual } from "@/components/shell/workspace-visuals";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { appPath } from "@/lib/routing/app-path";
import MenuItem from "@mui/material/MenuItem";
import { CheckIcon as Check } from "@phosphor-icons/react";
import Link from "next/link";

const ROW_SX = {
  alignItems: "center",
  borderRadius: "9px",
  gap: "10px",
  minHeight: 0,
  paddingX: "9px",
  paddingY: "8px",
  "&:hover": { backgroundColor: "var(--nav-active)" },
  "&.Mui-focusVisible": { backgroundColor: "var(--nav-active)" },
} as const;

export type WorkspaceRowProps = {
  workspace: WorkspaceSummary;
  index: number;
  active: boolean;
  onSelect: () => void;
};

export function WorkspaceRow({ workspace, index, active, onSelect }: Readonly<WorkspaceRowProps>) {
  const { Icon, tint, tintBg } = workspaceVisual(index);

  return (
    <MenuItem
      component={Link}
      href={appPath(workspace.publicId, "overview")}
      onClick={onSelect}
      selected={active}
      sx={{ ...ROW_SX, backgroundColor: active ? "var(--nav-active)" : "transparent" }}
    >
      <span
        className="grid h-7 w-7 flex-none place-items-center rounded-lg"
        style={{ background: tintBg, color: tint }}
      >
        <Icon aria-hidden size={15} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-tight text-fg">
          <span className="truncate">{workspace.name}</span>
          {workspace.isSample ? (
            <span className="rounded-full border border-border-strong px-1.5 py-px font-mono text-[9px] uppercase text-fg-muted">
              Sample
            </span>
          ) : null}
        </span>
        <span className="mt-px block font-mono text-[10px] text-fg-faint">
          {workspaceRowMeta(workspace)}
        </span>
      </span>
      <Check
        aria-hidden
        className="flex-none text-accent"
        size={14}
        style={{ visibility: active ? "visible" : "hidden" }}
        weight="bold"
      />
    </MenuItem>
  );
}
