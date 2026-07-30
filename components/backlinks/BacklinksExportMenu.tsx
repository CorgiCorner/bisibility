"use client";

import { Button, MenuSelectOptionItem, menuSelectPaperSx } from "@/components/ui";
import type { BacklinksRow } from "@/lib/backlinks/types";
import Menu from "@mui/material/Menu";
import {
  CaretDownIcon as CaretDown,
  DownloadSimpleIcon as DownloadSimple,
} from "@phosphor-icons/react";
import { useState } from "react";
import { backlinksExportContent } from "./backlinks-table-export";
import type { BacklinksSlice, BacklinksView } from "./backlinks-table-model";

function downloadBacklinksExport(input: {
  now: Date;
  rows: readonly BacklinksRow[];
  slice: BacklinksSlice;
  target: string;
  view: BacklinksView;
}) {
  const slug =
    input.target
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "results";
  const blob = new Blob([backlinksExportContent(input)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backlinks-${slug}-${input.view.replaceAll("_", "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function BacklinksExportMenu(
  props: Readonly<{
    now: Date;
    rows: readonly BacklinksRow[];
    slice: BacklinksSlice;
    target: string;
    view: BacklinksView;
  }>,
) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <Button
        endIcon={<CaretDown size={11} />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        size="xs"
        startIcon={<DownloadSimple size={14} />}
        variant="secondary"
      >
        Export
      </Button>
      <Menu
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        open={Boolean(anchorEl)}
        slotProps={{
          list: { "aria-label": "Export backlinks", dense: true, sx: { padding: 0 } },
          paper: { sx: menuSelectPaperSx },
        }}
      >
        <MenuSelectOptionItem
          current={false}
          onSelect={() => {
            downloadBacklinksExport(props);
            setAnchorEl(null);
          }}
          option={{ label: "Export CSV", value: "csv" }}
        />
      </Menu>
    </>
  );
}
