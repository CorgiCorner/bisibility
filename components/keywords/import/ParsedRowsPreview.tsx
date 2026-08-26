"use client";

import { tableHeaderClassName } from "@/components/ui";
import { useState } from "react";

export type KeywordImportPreviewRow = {
  city?: string | null;
  device?: string | null;
  intent?: string | null;
  keyword: string;
  language?: string | null;
  location?: string | null;
  locationKey?: string | null;
  row: number;
  tags?: readonly string[] | null;
  targetUrl?: string | null;
  topic?: string | null;
};

const PREVIEW_COLUMNS = [
  "Keyword",
  "Target URL",
  "Tags",
  "Topic",
  "Intent",
  "Country",
  "Language",
  "City",
  "Location key",
  "Device",
] as const;
const PREVIEW_ROW_HEIGHT = 42;
const PREVIEW_VISIBLE_ROWS = 10;

function previewCell(value: string | null | undefined) {
  return value || "-";
}

export function ParsedRowsPreview({
  rows,
}: Readonly<{ rows: readonly KeywordImportPreviewRow[] }>) {
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.min(
    Math.max(0, Math.floor(scrollTop / PREVIEW_ROW_HEIGHT)),
    Math.max(0, rows.length - PREVIEW_VISIBLE_ROWS),
  );
  const end = Math.min(rows.length, start + PREVIEW_VISIBLE_ROWS);
  const visibleRows = rows.slice(start, end);
  const topSpace = start * PREVIEW_ROW_HEIGHT;
  const bottomSpace = (rows.length - end) * PREVIEW_ROW_HEIGHT;

  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <section
        aria-label="Imported rows preview"
        className="max-h-[456px] overflow-auto rounded-card border border-border"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <table className="w-full min-w-[1100px] border-collapse text-left text-[12px]">
          <thead className={`${tableHeaderClassName} sticky top-0 z-10`}>
            <tr>
              {PREVIEW_COLUMNS.map((label) => (
                <th className="px-3 py-2 font-medium" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topSpace ? (
              <tr style={{ height: topSpace }}>
                <td colSpan={PREVIEW_COLUMNS.length} />
              </tr>
            ) : null}
            {visibleRows.map((row) => (
              <tr className="h-[42px] border-t border-border-soft" key={row.row}>
                <td className="px-3 py-2.5 font-semibold text-fg">{previewCell(row.keyword)}</td>
                <td className="px-3 py-2.5 text-fg-muted">{previewCell(row.targetUrl)}</td>
                <td className="px-3 py-2.5 text-fg-muted">{row.tags?.join(", ") || "-"}</td>
                <td className="px-3 py-2.5 text-fg-muted">{previewCell(row.topic)}</td>
                <td className="px-3 py-2.5 text-fg-muted">{previewCell(row.intent)}</td>
                <td className="px-3 py-2.5 text-fg-muted">{previewCell(row.location)}</td>
                <td className="px-3 py-2.5 text-fg-muted">{previewCell(row.language)}</td>
                <td className="px-3 py-2.5 text-fg-muted">{previewCell(row.city)}</td>
                <td className="px-3 py-2.5 text-fg-muted">{previewCell(row.locationKey)}</td>
                <td className="px-3 py-2.5 text-fg-muted">{previewCell(row.device)}</td>
              </tr>
            ))}
            {bottomSpace ? (
              <tr style={{ height: bottomSpace }}>
                <td colSpan={PREVIEW_COLUMNS.length} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
