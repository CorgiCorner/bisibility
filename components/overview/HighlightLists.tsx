import { MarketChip } from "@/components/markets/MarketChip";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import { appPath } from "@/lib/routing/app-path";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import Link from "next/link";
import type { HighlightList, HighlightRow } from "./types";

export type HighlightListsProps = {
  lists: HighlightList[];
  projectRef: string;
  rowHref?: (row: HighlightRow) => string;
};

const positionToneClassName = {
  danger: "text-red-text",
  default: "text-fg",
  muted: "text-fg-muted",
} satisfies Record<NonNullable<HighlightRow["positionTone"]>, string>;

const emptyCopy = {
  wins: {
    description: "Complete another check to compare positions.",
    title: "Needs another check",
  },
  attention: {
    description: "Complete another check to compare positions.",
    title: "Needs another check",
  },
  newTop10: {
    description: "No keywords entered the top 10 in this view.",
    title: "No matches",
  },
  recentlyAdded: {
    description: "No keywords were added in the last 7 days.",
    title: "No matches",
  },
} satisfies Record<HighlightList["kind"], { description: string; title: string }>;

function Delta({ row }: Readonly<{ row: HighlightRow }>) {
  if (!row.delta) {
    return null;
  }

  const Icon = row.delta.direction === "up" ? ArrowUp : ArrowDown;
  const colorClassName = row.delta.direction === "up" ? "text-green-text" : "text-red-text";

  return (
    <Tooltip content={row.delta.title}>
      <span
        className={`inline-flex items-center gap-0.5 font-sans tabular-nums text-[11px] font-semibold ${colorClassName}`}
      >
        <Icon aria-hidden size={12} weight="regular" />
        {row.delta.value}
      </span>
    </Tooltip>
  );
}

function MarketIdentity({ row }: Readonly<{ row: HighlightRow }>) {
  // Guarded so a bare `/` can never render: a row without a resolved pair shows no chip.
  if (!row.marketLocationLabel || !row.marketLanguageLabel) return null;

  return (
    <span className="mt-1.5 flex min-w-0 items-center">
      <MarketChip
        className="max-w-[208px]"
        device={row.device === "mobile" || row.device === "desktop" ? row.device : null}
        languageLabel={row.marketLanguageLabel}
        locationLabel={row.marketLocationLabel}
      />
    </span>
  );
}

export function HighlightLists({ lists, projectRef, rowHref }: Readonly<HighlightListsProps>) {
  if (lists.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
      {lists.map((list) => {
        return (
          <Card className="flex min-w-0 flex-col overflow-hidden p-0" key={list.title} size="md">
            <div className="flex-none px-4.5 pb-3 pt-[15px]">
              <div className="flex items-center text-sm font-semibold text-fg">{list.title}</div>
              <span className="mt-[3px] block min-h-[2lh]">{list.subtitle}</span>
            </div>
            <div className="flex flex-1 flex-col">
              {list.rows.length === 0 ? (
                <div className="grid flex-1 place-items-center border-t border-border p-3">
                  <EmptyState compact {...emptyCopy[list.kind]} />
                </div>
              ) : (
                list.rows.map((row) => (
                  <Link
                    className="flex min-h-[68px] items-center justify-between gap-2.5 border-t border-border px-4.5 py-2.5 hover:bg-bg-sunken"
                    href={rowHref?.(row) ?? appPath(projectRef, "rank-tracker", row.id)}
                    key={row.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-fg">
                        {row.keyword}
                      </span>
                      <MarketIdentity row={row} />
                      <span className="mt-2 block truncate font-sans tabular-nums text-[10.5px] text-fg-muted">
                        {row.note}
                      </span>
                    </span>
                    <span className="inline-flex flex-none items-center gap-2">
                      <span
                        className={`font-sans tabular-nums text-[13px] font-semibold ${
                          positionToneClassName[row.positionTone ?? "default"]
                        }`}
                      >
                        {row.positionText}
                      </span>
                      <Delta row={row} />
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
