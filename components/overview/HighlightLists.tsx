import { MarketChip } from "@/components/markets/MarketChip";
import { Card, EmptyState, MonoText } from "@/components/ui";
import { appPath } from "@/lib/routing/app-path";
import Tooltip from "@mui/material/Tooltip";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  PlusCircleIcon as PlusCircle,
  StarIcon as Star,
  TrendUpIcon as TrendUp,
  WarningIcon as Warning,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { HighlightList, HighlightRow } from "./types";

export type HighlightListsProps = {
  lists: HighlightList[];
  projectRef: string;
  rowHref?: (row: HighlightRow) => string;
};

const iconByKind = {
  wins: TrendUp,
  attention: Warning,
  newTop10: Star,
  recentlyAdded: PlusCircle,
} satisfies Record<HighlightList["kind"], typeof TrendUp>;

const colorByKind = {
  wins: "var(--green)",
  attention: "var(--yellow)",
  newTop10: "var(--accent)",
  recentlyAdded: "var(--blue)",
} satisfies Record<HighlightList["kind"], string>;

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
    <Tooltip title={row.delta.title}>
      <span
        className={`inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold ${colorClassName}`}
      >
        <Icon aria-hidden size={12} weight="bold" />
        {row.delta.value}
      </span>
    </Tooltip>
  );
}

function MarketIdentity({ row }: Readonly<{ row: HighlightRow }>) {
  // Guarded so a bare `/` can never render: a row without a resolved pair shows no chip.
  if (!row.marketLocationLabel || !row.marketLanguageLabel) return null;

  return (
    <span className="mt-1 flex min-w-0 items-center">
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
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
      {lists.map((list) => {
        const Icon = iconByKind[list.kind];

        return (
          <Card className="flex min-w-0 flex-col overflow-hidden p-0" key={list.title} size="md">
            <div className="flex-none px-[18px] pb-3 pt-[15px]">
              <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Icon aria-hidden color={colorByKind[list.kind]} size={16} weight="fill" />
                {list.title}
              </div>
              <MonoText className="mt-[3px] block min-h-[2lh]" muted size="sm">
                {list.subtitle}
              </MonoText>
            </div>
            <div className="flex flex-1 flex-col">
              {list.rows.length === 0 ? (
                <div className="grid flex-1 place-items-center border-t border-border-soft p-3">
                  <EmptyState compact {...emptyCopy[list.kind]} />
                </div>
              ) : (
                list.rows.map((row) => (
                  <Link
                    className="flex min-h-[58px] items-center justify-between gap-2.5 border-t border-border-soft px-[18px] py-2.5 hover:bg-bg-sunken"
                    href={rowHref?.(row) ?? appPath(projectRef, "rank-tracker", row.id)}
                    key={row.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-fg">
                        {row.keyword}
                      </span>
                      <MarketIdentity row={row} />
                      <span className="mt-px block truncate font-mono text-[10.5px] text-fg-muted">
                        {row.note}
                      </span>
                    </span>
                    <span className="inline-flex flex-none items-center gap-2">
                      <span
                        className={`font-mono text-[13px] font-semibold ${
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
