"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { useToast } from "@/components/ui/toast-context";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CopyIcon as Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/dist/csr/DotsThreeVertical";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
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
): DataTableColumn<KeywordRow> {
  return {
    cell: ({ row }) =>
      marketGridParent(row.original) ? null : (
        <RowActionsCell
          {...callbacks}
          checkPending={pendingCheckIds.has(row.original.id)}
          projectRef={projectRef}
          row={row.original}
        />
      ),
    enableSorting: false,
    header: "",
    id: "actions",
    maxSize: 52,
    meta: {
      align: "end",
      lockResize: true,
      lockVisible: true,
      pin: "right",
      sortable: false,
    },
    minSize: 52,
    size: 52,
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
    router.push(appPath(projectRef, "rank-tracker", row.id));
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
      showToast("Could not copy keyword ID", { severity: "error" });
      return;
    }
    try {
      await clipboard.writeText(row.id);
      showToast("Keyword ID copied", { severity: "success" });
    } catch {
      showToast("Could not copy keyword ID", { severity: "error" });
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
        style={{ "--control-color": "var(--fg-muted)" }}
      >
        <DotsThreeVertical size={17} weight="regular" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        id={menuId}
        onClick={(event) => event.stopPropagation()}
        onClose={closeMenu}
        open={Boolean(anchorEl)}
        contentProps={{ style: { border: "1px solid var(--border)" } }}
      >
        {canUpdateKeyword ? (
          <MenuItem
            disabled={readOnly}
            onClick={(event) => select(event, onEdit)}
            style={{ gap: "10px", minHeight: 36 }}
          >
            <PencilSimple weight="regular" size={15} />
            Edit keyword
          </MenuItem>
        ) : null}
        <MenuItem onClick={open} style={{ gap: "10px", minHeight: 36 }}>
          <ArrowUpRight weight="regular" size={15} />
          View details
        </MenuItem>
        <MenuItem onClick={copyId} style={{ gap: "10px", minHeight: 36 }}>
          <Copy weight="regular" size={15} />
          Copy keyword ID
        </MenuItem>
        {canUpdateKeyword ? (
          <MenuItem
            disabled={readOnly || checkPending}
            onClick={(event) => select(event, onRunCheck)}
            style={{ gap: "10px", minHeight: 36 }}
          >
            <ArrowsClockwise weight="regular" size={15} />
            {`Run check (Top ${effectiveRowDepth(row)})`}
          </MenuItem>
        ) : null}
        {canDeleteKeyword ? (
          <MenuItem
            disabled={readOnly}
            onClick={(event) => select(event, onDelete)}
            style={{ "--control-color": "var(--red)", gap: "10px", minHeight: 36 }}
          >
            <Trash weight="regular" size={15} />
            Delete
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}
