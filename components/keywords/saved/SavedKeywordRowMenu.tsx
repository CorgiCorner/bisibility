"use client";

import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { useToast } from "@/components/ui/toast-context";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { CopyIcon as Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/dist/csr/DotsThreeVertical";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
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
      showToast("Keyword copied", { severity: "success" });
    } catch {
      showToast("Could not copy keyword", { severity: "error" });
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
        style={{ "--control-color": "var(--fg-muted)" }}
      >
        <DotsThreeVertical size={17} weight="regular" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        onClick={(event) => event.stopPropagation()}
        onClose={close}
        open={Boolean(anchorEl)}
        listProps={{}}
        contentProps={{
          style: {
            backgroundColor: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: UI_RADIUS_ROLES.control,
            minWidth: 210,
            padding: "6px",
          },
        }}
      >
        {canTrack ? (
          <MenuItem onClick={(event) => select(event, () => onTrack(row))} style={{ gap: "9px" }}>
            <ChartLineUp weight="regular" size={14} />
            Track now
          </MenuItem>
        ) : null}
        <MenuItem
          component={Link}
          href={savedKeywordResearchHref(projectRef, row)}
          onClick={close}
          style={{ gap: "9px" }}
        >
          <MagnifyingGlass weight="regular" size={14} />
          Open source search
        </MenuItem>
        <MenuItem onClick={copy} style={{ gap: "9px" }}>
          <Copy weight="regular" size={14} />
          Copy keyword
        </MenuItem>
        {canDelete ? (
          <MenuItem
            onClick={(event) => select(event, () => onRemove(row))}
            style={{ "--control-color": "var(--red)", gap: "9px" }}
          >
            <Trash weight="regular" size={14} />
            Remove from saved
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}
