"use client";

import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { menuSelectPaperStyle } from "@/components/ui/MenuSelect";
import { MenuSelectOptionItem } from "@/components/ui/MenuSelectOptionItem";
import type { BacklinksRow } from "@/lib/backlinks/types";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
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
        endIcon={<CaretDown weight="regular" size={11} />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        size="xs"
        startIcon={<DownloadSimple weight="regular" size={14} />}
        variant="secondary"
      >
        Export
      </Button>
      <Menu
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        open={Boolean(anchorEl)}
        listProps={{ "aria-label": "Export backlinks", style: { padding: 0 } }}
        contentProps={{ style: menuSelectPaperStyle }}
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
