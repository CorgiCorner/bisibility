"use client";

import { track } from "@/lib/analytics/client";
import { positionBandLabel } from "@/lib/search-insights/constants";
import type { SearchInsightsSignals } from "@/lib/search-insights/queries/signals";
import {
  CaretRightIcon as CaretRight,
  IntersectIcon as Intersect,
  TargetIcon as Target,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";
import type { ReactNode } from "react";
import { SIGNAL_COPY } from "./search-insights-copy";

export type SearchInsightsSignalChipsProps = {
  /** Slot for the optional second-source card, which is not a peer of the two chips. */
  ga4Card?: ReactNode;
  onOpenBand?: () => void;
  onOpenOverlap?: () => void;
  signals: SearchInsightsSignals;
};

function Chip({
  count,
  icon: Glyph,
  onOpen,
  sub,
  title,
  which,
}: Readonly<{
  count: number;
  icon: Icon;
  onOpen?: () => void;
  sub: string;
  title: string;
  which: "band" | "overlap";
}>) {
  return (
    <button
      className="flex items-center gap-3 rounded-card border border-border bg-bg-elev px-4 py-3 text-left hover:border-border-control"
      onClick={() => {
        track("search_insights_chip_opened", { which });
        onOpen?.();
      }}
      type="button"
    >
      <span className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-control bg-bg-sunken text-fg-muted">
        <Glyph aria-hidden size={19} weight="regular" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="font-sans tabular-nums text-ui-section">
            {count.toLocaleString("en-US")}
          </span>
          <span className="text-ui-body font-semibold">{title}</span>
        </span>
        <span className="text-ui-caption text-fg-muted">{sub}</span>
      </span>
      <CaretRight aria-hidden className="shrink-0 text-fg-muted" size={13} weight="regular" />
    </button>
  );
}

export function SearchInsightsSignalChips({
  ga4Card,
  onOpenBand,
  onOpenOverlap,
  signals,
}: Readonly<SearchInsightsSignalChipsProps>) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-2.5 md:grid-cols-2">
      {/* The band is named, not nicknamed: the number cannot mean two things, the jargon can. */}
      <Chip
        count={signals.bandCount}
        icon={Target}
        onOpen={onOpenBand}
        sub={SIGNAL_COPY.bandSub}
        title={`queries at ${positionBandLabel()}`}
        which="band"
      />
      <Chip
        count={signals.overlapCount}
        icon={Intersect}
        onOpen={onOpenOverlap}
        sub={SIGNAL_COPY.overlapSub}
        title={SIGNAL_COPY.overlapTitle}
        which="overlap"
      />
      {ga4Card ? <div className="md:col-span-2">{ga4Card}</div> : null}
    </div>
  );
}
