"use client";

import { useToast } from "@/components/ui";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import {
  ChartLineUpIcon as ChartLineUp,
  CopyIcon as Copy,
  DotsThreeVerticalIcon as DotsThreeVertical,
  MagnifyingGlassIcon as MagnifyingGlass,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import Link from "next/link";
import { type MouseEvent, useState } from "react";
import { savedKeywordResearchHref } from "./saved-keywords-table-model";

type SavedKeywordRowMenuProps = {
  canDelete: boolean;
  canTrack: boolean;
  onRemove: (row: SavedKeywordRow) => void;
  onTrack: (row: SavedKeywordRow) => void;
  projectRef: string;
  row: SavedKeywordRow;
};

export function SavedKeywordRowMenu({
  canDelete,
  canTrack,
  onRemove,
  onTrack,
  projectRef,
  row,
}: Readonly<SavedKeywordRowMenuProps>) {
  const { showToast } = useToast();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = () => setAnchorEl(null);

  function select(event: MouseEvent<HTMLElement>, action: () => void) {
    event.stopPropagation();
    close();
    action();
  }

  async function copy(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
    close();
    try {
      await navigator.clipboard.writeText(row.text);
      showToast("Keyword copied", { tint: "green" });
    } catch {
      showToast("Could not copy keyword", { tint: "red" });
    }
  }

  return (
    <>
      <IconButton
        aria-label={`Actions for ${row.text}`}
        onClick={(event) => {
          event.stopPropagation();
          setAnchorEl(event.currentTarget);
        }}
        size="small"
        sx={{ color: "var(--fg-muted)" }}
      >
        <DotsThreeVertical size={17} weight="bold" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        onClick={(event) => event.stopPropagation()}
        onClose={close}
        open={Boolean(anchorEl)}
        slotProps={{
          list: { dense: true },
          paper: {
            sx: {
              backgroundColor: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: "11px",
              minWidth: 210,
              padding: "6px",
            },
          },
        }}
      >
        {canTrack ? (
          <MenuItem onClick={(event) => select(event, () => onTrack(row))} sx={{ gap: "9px" }}>
            <ChartLineUp size={14} />
            Track now
          </MenuItem>
        ) : null}
        <MenuItem
          component={Link}
          href={savedKeywordResearchHref(projectRef, row)}
          onClick={close}
          sx={{ gap: "9px" }}
        >
          <MagnifyingGlass size={14} />
          Open source search
        </MenuItem>
        <MenuItem onClick={copy} sx={{ gap: "9px" }}>
          <Copy size={14} />
          Copy keyword
        </MenuItem>
        {canDelete ? (
          <MenuItem
            onClick={(event) => select(event, () => onRemove(row))}
            sx={{ color: "var(--red)", gap: "9px" }}
          >
            <Trash size={14} />
            Remove from saved
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}
