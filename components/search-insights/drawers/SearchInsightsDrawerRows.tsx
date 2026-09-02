"use client";

import {
  AVG_POSITION_TIP,
  overlapBadgeTitle,
} from "@/components/search-insights/search-insights-copy";
import {
  formatRowCount,
  formatRowPosition,
  tableRowKeys,
} from "@/components/search-insights/search-insights-rows-model";
import {
  type ModuleTableVariant,
  moduleTableColumnClasses,
  moduleTableMinWidth,
} from "@/components/search-insights/search-insights-table-columns";
import { tableHeaderClassName } from "@/components/ui";
import type { SearchInsightsBandRow } from "@/lib/search-insights/queries/band-list";
import type { SearchInsightsOverlapRow } from "@/lib/search-insights/queries/overlap-list";
import { cn } from "@/lib/ui/cn";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { drawerFrameKey } from "./drawer-model";

const ROW =
  "cursor-pointer border-b border-border-soft last:border-b-0 hover:bg-bg-sunken focus-visible:bg-bg-sunken";
const CELL = "px-3.25 py-2.5 align-middle";
const TEXT = "truncate font-sans tabular-nums text-ui-caption";
const NUMBER = "px-1 text-right font-sans tabular-nums text-ui-caption font-semibold";
const MUTED = "px-1 text-right font-sans tabular-nums text-ui-caption text-fg-muted";
const DECISION =
  "flex items-center justify-end gap-1.5 font-sans tabular-nums text-ui-caption text-fg-muted";

export type DrawerRow = {
  clicks: number;
  key: string;
  label: string;
  onOpen: () => void;
  position: number | null;
  title: string;
};

function ListTable({
  children,
  headers,
  label,
  variant,
}: Readonly<{
  children: ReactNode;
  headers?: readonly { align?: boolean; label: string; title?: string }[];
  label: string;
  variant: ModuleTableVariant;
}>) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table
        aria-label={label}
        className={cn("w-full table-fixed border-collapse", moduleTableMinWidth[variant])}
      >
        <colgroup>
          {moduleTableColumnClasses(variant).map((columnClass, index) => (
            <col className={columnClass} key={`${columnClass}-${index}`} />
          ))}
        </colgroup>
        {headers ? (
          <thead className={tableHeaderClassName}>
            <tr>
              {headers.map((header) => (
                <th
                  className={cn(
                    "whitespace-nowrap px-3.25 py-2 font-normal",
                    header.align ? "px-1 text-right" : "text-left",
                    header.title && "cursor-help",
                  )}
                  key={header.label}
                  scope="col"
                  title={header.title}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        {children}
      </table>
    </div>
  );
}

const SLICE_NUMERIC_HEADERS = [
  { align: true, label: "Clicks" },
  { align: true, label: "Avg pos", title: AVG_POSITION_TIP },
] as const;

export type DrawerSliceRowsProps = {
  label: string;
  rows: readonly DrawerRow[];
  seen: ReadonlySet<string>;
  textHeader: "Page" | "Query";
};

/** A query's pages, or a page's queries: the same three columns either way. */
export function DrawerSliceRows({ label, rows, seen, textHeader }: Readonly<DrawerSliceRowsProps>) {
  const headers = [{ label: textHeader }, ...SLICE_NUMERIC_HEADERS];
  return (
    <ListTable headers={headers} label={label} variant="drawer">
      <tbody>
        {rows.map((row) => (
          <tr
            className={cn(ROW, "data-[seen=1]:bg-bg-sunken")}
            data-seen={seen.has(row.key) ? "1" : undefined}
            key={row.key}
            onClick={row.onOpen}
            onKeyDown={tableRowKeys(row.onOpen)}
            tabIndex={0}
          >
            <td className={cn(CELL, TEXT)} title={row.title}>
              {row.label}
            </td>
            <td className={cn(CELL, NUMBER)}>{formatRowCount(row.clicks)}</td>
            <td className={cn(CELL, "px-1")}>
              <span className={DECISION}>
                {row.position === null ? "-" : formatRowPosition(row.position)}
                <CaretRight aria-hidden className="shrink-0" size={11} weight="regular" />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </ListTable>
  );
}

const BAND_HEADERS = [
  { label: "Query" },
  { align: true, label: "Clicks" },
  { align: true, label: "Impr" },
  { align: true, label: "Avg pos", title: AVG_POSITION_TIP },
] as const;

export type DrawerBandRowsProps = {
  label: string;
  onOpen: (query: string) => void;
  rows: readonly SearchInsightsBandRow[];
  seen: ReadonlySet<string>;
};

/** The band list carries demand as well, because demand is what its ordering is about. */
export function DrawerBandRows({ label, onOpen, rows, seen }: Readonly<DrawerBandRowsProps>) {
  return (
    <ListTable headers={BAND_HEADERS} label={label} variant="drawerBand">
      <tbody>
        {rows.map((row) => {
          const open = () => onOpen(row.query);
          return (
            <tr
              className={cn(ROW, "data-[seen=1]:bg-bg-sunken")}
              data-seen={
                seen.has(drawerFrameKey({ kind: "query", query: row.query })) ? "1" : undefined
              }
              key={row.query}
              onClick={open}
              onKeyDown={tableRowKeys(open)}
              tabIndex={0}
            >
              <td className={cn(CELL, TEXT)} title={row.query}>
                {row.query}
              </td>
              <td className={cn(CELL, NUMBER)}>{formatRowCount(row.clicks)}</td>
              <td className={cn(CELL, MUTED)}>{formatRowCount(row.impressions)}</td>
              <td className={cn(CELL, "px-1")}>
                <span className={DECISION}>
                  {formatRowPosition(row.position)}
                  <CaretRight aria-hidden className="shrink-0" size={11} weight="regular" />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </ListTable>
  );
}

export type DrawerOverlapRowsProps = {
  label: string;
  onOpen: (query: string) => void;
  rows: readonly SearchInsightsOverlapRow[];
  seen: ReadonlySet<string>;
};

/**
 * The overlap rows prove the overlap rather than asserting it: the busiest of the project's own
 * pages sit under the query in the same columns, and the badge counts the rest.
 */
export function DrawerOverlapRows({ label, onOpen, rows, seen }: Readonly<DrawerOverlapRowsProps>) {
  return (
    <ListTable label={label} variant="drawer">
      {rows.map((row) => {
        const open = () => onOpen(row.query);
        return (
          <tbody className="border-b border-border-soft last:border-b-0" key={row.query}>
            <tr
              className="cursor-pointer hover:bg-bg-sunken focus-visible:bg-bg-sunken data-[seen=1]:bg-bg-sunken"
              data-seen={
                seen.has(drawerFrameKey({ kind: "query", query: row.query })) ? "1" : undefined
              }
              onClick={open}
              onKeyDown={tableRowKeys(open)}
              tabIndex={0}
            >
              <td className={cn(CELL, "pb-1")}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={TEXT} title={row.query}>
                    {row.query}
                  </span>
                  <span
                    className="shrink-0 rounded-control border border-border px-1.5 font-sans tabular-nums text-ui-micro text-fg-muted"
                    title={overlapBadgeTitle(row.pages)}
                  >
                    x{row.pages}
                  </span>
                </span>
              </td>
              <td className={cn(CELL, NUMBER, "pb-1")}>{formatRowCount(row.clicks)}</td>
              <td className={cn(CELL, "px-1 pb-1")}>
                <span className={DECISION}>
                  {row.position === null ? "-" : formatRowPosition(row.position)}
                  <CaretRight aria-hidden className="shrink-0" size={11} weight="regular" />
                </span>
              </td>
            </tr>
            {row.split.map((page) => (
              <tr key={page.url}>
                <td
                  className="truncate px-3.25 pb-1.5 pl-7.25 font-sans tabular-nums text-ui-micro text-fg-muted"
                  title={page.url}
                >
                  {page.path}
                </td>
                <td className="px-1 pb-1.5 text-right font-sans tabular-nums text-ui-micro text-fg-muted">
                  {formatRowCount(page.clicks)}
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        );
      })}
    </ListTable>
  );
}
