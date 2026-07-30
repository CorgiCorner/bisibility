"use client";

import { Button, MenuSelectOptionItem, menuSelectPaperSx } from "@/components/ui";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { downloadTextFile } from "@/lib/ui/download";
import Menu from "@mui/material/Menu";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";

// Client-only export UI. Pure table/panel helpers live in research-results-model.tsx
// so consumers that only format data do not pull the MUI menu chain in.

export type ResearchExportFormat = "csv" | "json";

function csvField(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function researchExportContent(
  rows: readonly GroupedResearchRow[],
  format: ResearchExportFormat,
) {
  if (format === "json") {
    return JSON.stringify(
      rows.map((row) => ({
        cpcCents: row.cpcCents,
        difficulty: row.difficulty,
        intent: row.intent,
        keyword: row.keyword,
        searchVolume: row.searchVolume,
        source: row.source,
        tracked: row.alreadyTracked,
        variants: row.variants.map((variant) => variant.keyword),
      })),
      null,
      2,
    );
  }
  const lines = rows.map((row) =>
    [
      csvField(row.keyword),
      row.searchVolume ?? "",
      row.difficulty ?? "",
      row.cpcCents == null ? "" : (row.cpcCents / 100).toFixed(2),
      row.intent ?? "",
      row.source,
      row.alreadyTracked ? "yes" : "no",
      csvField(row.variants.map((variant) => variant.keyword).join("; ")),
    ].join(","),
  );
  return ["keyword,volume,kd,cpc_usd,intent,source,tracked,variants", ...lines].join("\n");
}

function downloadResearchExport(
  rows: readonly GroupedResearchRow[],
  seed: string,
  format: ResearchExportFormat,
) {
  const slug =
    seed
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "results";
  downloadTextFile(
    researchExportContent(rows, format),
    `keyword-research-${slug}.${format}`,
    format === "csv" ? "text/csv;charset=utf-8" : "application/json",
  );
}

export function ResearchExportMenu({
  rows,
  seed,
}: Readonly<{ rows: GroupedResearchRow[]; seed: string }>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  function exportAs(format: ResearchExportFormat) {
    downloadResearchExport(rows, seed, format);
    setAnchorEl(null);
  }

  return (
    <>
      <Button
        onClick={(event) => setAnchorEl(event.currentTarget)}
        size="sm"
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
          list: { "aria-label": "Export results", dense: true, sx: { padding: 0 } },
          paper: { sx: menuSelectPaperSx },
        }}
      >
        <MenuSelectOptionItem
          current={false}
          onSelect={() => exportAs("csv")}
          option={{ label: "Export CSV", value: "csv" }}
        />
        <MenuSelectOptionItem
          current={false}
          onSelect={() => exportAs("json")}
          option={{ label: "Export JSON", value: "json" }}
        />
      </Menu>
    </>
  );
}
