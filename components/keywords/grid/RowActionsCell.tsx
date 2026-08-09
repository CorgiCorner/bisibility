"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { useToast } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { GridColDef } from "@mui/x-data-grid";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  ArrowUpRightIcon as ArrowUpRight,
  CopyIcon as Copy,
  DotsThreeVerticalIcon as DotsThreeVertical,
  PencilSimpleIcon as PencilSimple,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState } from "react";
import { effectiveRowDepth } from "./run-check-depth";

type RowActionsCellProps = {
  canDeleteKeyword: boolean;
  canUpdateKeyword: boolean;
  checkPending?: boolean;
  onDelete: (row: KeywordRow) => void;
  onEdit: (row: KeywordRow) => void;
  onRunCheck: (row: KeywordRow) => void;
  projectRef: string;
  row: KeywordRow;
};

type RowActionCallbacks = Omit<RowActionsCellProps, "checkPending" | "projectRef" | "row">;

export function rowActionsColumn(
  callbacks: RowActionCallbacks,
  projectRef: string,
  pendingCheckIds: ReadonlySet<string> = new Set(),
): GridColDef<KeywordRow> {
  return {
    align: "right",
    disableColumnMenu: true,
    field: "actions",
    filterable: false,
    headerName: "",
    renderCell: ({ row }) => (
      <RowActionsCell
        {...callbacks}
        checkPending={pendingCheckIds.has(row.id)}
        projectRef={projectRef}
        row={row}
      />
    ),
    resizable: false,
    sortable: false,
    width: 52,
  };
}

export function RowActionsCell({
  canDeleteKeyword,
  canUpdateKeyword,
  checkPending = false,
  onDelete,
  onEdit,
  onRunCheck,
  projectRef,
  row,
}: Readonly<RowActionsCellProps>) {
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const { showToast } = useToast();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuId = `keyword-row-actions-${row.id}`;

  function openMenu(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  }

  function closeMenu(event?: { stopPropagation?: () => void }) {
    event?.stopPropagation?.();
    setAnchorEl(null);
  }

  function open(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
    setAnchorEl(null);
    router.push(appPath(projectRef, "keywords", row.id));
  }

  function select(event: MouseEvent<HTMLElement>, action: (row: KeywordRow) => void) {
    event.stopPropagation();
    setAnchorEl(null);
    action(row);
  }

  async function copyId(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
    setAnchorEl(null);
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      showToast("Could not copy keyword ID", { tint: "red" });
      return;
    }
    try {
      await clipboard.writeText(row.id);
      showToast("Keyword ID copied", { tint: "green" });
    } catch {
      showToast("Could not copy keyword ID", { tint: "red" });
    }
  }

  return (
    <>
      <IconButton
        aria-controls={anchorEl ? menuId : undefined}
        aria-expanded={anchorEl ? "true" : undefined}
        aria-haspopup="menu"
        aria-label="Keyword actions"
        onClick={openMenu}
        size="small"
        sx={{ color: "var(--fg-muted)" }}
      >
        <DotsThreeVertical size={17} weight="bold" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        id={menuId}
        onClick={(event) => event.stopPropagation()}
        onClose={closeMenu}
        open={Boolean(anchorEl)}
        slotProps={{ paper: { sx: { border: "1px solid var(--border)" } } }}
      >
        {canUpdateKeyword ? (
          <MenuItem
            disabled={readOnly}
            onClick={(event) => select(event, onEdit)}
            sx={{ gap: "10px", minHeight: 36 }}
          >
            <PencilSimple size={15} />
            Edit keyword
          </MenuItem>
        ) : null}
        <MenuItem onClick={open} sx={{ gap: "10px", minHeight: 36 }}>
          <ArrowUpRight size={15} />
          View details
        </MenuItem>
        <MenuItem onClick={copyId} sx={{ gap: "10px", minHeight: 36 }}>
          <Copy size={15} />
          Copy keyword ID
        </MenuItem>
        {canUpdateKeyword ? (
          <MenuItem
            disabled={readOnly || checkPending}
            onClick={(event) => select(event, onRunCheck)}
            sx={{ gap: "10px", minHeight: 36 }}
          >
            <ArrowsClockwise size={15} />
            {`Run check (Top ${effectiveRowDepth(row)})`}
          </MenuItem>
        ) : null}
        {canDeleteKeyword ? (
          <MenuItem
            disabled={readOnly}
            onClick={(event) => select(event, onDelete)}
            sx={{ color: "var(--red)", gap: "10px", minHeight: 36 }}
          >
            <Trash size={15} />
            Delete
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}
