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
import { type ReactNode, use } from "react";
import { useSearchInsightsDrawerHandlers } from "./drawers/useDrawerHandlers";
import { SIGNAL_COPY } from "./search-insights-copy";

export type SearchInsightsSignalChipsProps = {
  /** Slot for the optional second-source card, which is not a peer of the two chips. */
  ga4Card?: ReactNode;
  namedQueryCount: number;
  onOpenBand?: () => void;
  onOpenOverlap?: () => void;
  signals?: SearchInsightsSignals;
  state?: "error" | "pending" | "ready";
};

export type SearchInsightsSignalResult =
  | { state: "error" }
  | { state: "ready"; signals: SearchInsightsSignals };

function Chip({
  count,
  icon: Glyph,
  onOpen,
  state,
  sub,
  title,
  which,
}: Readonly<{
  count?: number;
  icon: Icon;
  onOpen?: () => void;
  state: "error" | "pending" | "ready";
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
      aria-busy={state === "pending"}
      disabled={state !== "ready"}
      type="button"
    >
      <span className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-control bg-bg-sunken text-fg-muted">
        <Glyph aria-hidden size={19} weight="regular" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className="inline-flex w-[7ch] shrink-0 font-sans tabular-nums text-ui-section"
            data-signal-number
          >
            {state === "pending" ? (
              <span
                aria-hidden
                className="h-3.5 w-full animate-pulse rounded-control bg-bg-sunken"
              />
            ) : null}
            {state === "ready" ? count?.toLocaleString("en-US") : null}
          </span>
          <span className="text-ui-body font-semibold">
            {state === "error" ? `${SIGNAL_COPY.failed}: ` : null}
            {title}
          </span>
        </span>
        <span className="text-ui-caption text-fg-muted">{sub}</span>
      </span>
      <CaretRight aria-hidden className="shrink-0 text-fg-muted" size={13} weight="regular" />
    </button>
  );
}

export function SearchInsightsSignalChips({
  ga4Card,
  namedQueryCount,
  onOpenBand,
  onOpenOverlap,
  state = "ready",
  signals,
}: Readonly<SearchInsightsSignalChipsProps>) {
  const drawers = useSearchInsightsDrawerHandlers();
  const bandCount = signals?.bandCount;
  const overlapCount = signals?.overlapCount;
  return (
    <div className="grid grid-cols-1 items-stretch gap-2.5 md:grid-cols-2">
      {/* The band is named, not nicknamed: the number cannot mean two things, the jargon can. */}
      <Chip
        count={bandCount}
        icon={Target}
        onOpen={
          onOpenBand ??
          (bandCount === undefined
            ? undefined
            : () => drawers.openList("band", bandCount, namedQueryCount))
        }
        state={state}
        sub={SIGNAL_COPY.bandSub}
        title={`queries at ${positionBandLabel()}`}
        which="band"
      />
      <Chip
        count={overlapCount}
        icon={Intersect}
        onOpen={
          onOpenOverlap ??
          (overlapCount === undefined
            ? undefined
            : () => drawers.openList("overlap", overlapCount, namedQueryCount))
        }
        state={state}
        sub={SIGNAL_COPY.overlapSub}
        title={SIGNAL_COPY.overlapTitle}
        which="overlap"
      />
      {ga4Card ? <div className="md:col-span-2">{ga4Card}</div> : null}
    </div>
  );
}

export function SearchInsightsSignalChipsResolver({
  ga4Card,
  namedQueryCount,
  result,
}: Readonly<{
  ga4Card?: ReactNode;
  namedQueryCount: number;
  result: Promise<SearchInsightsSignalResult>;
}>) {
  const settled = use(result);
  return settled.state === "ready" ? (
    <SearchInsightsSignalChips
      ga4Card={ga4Card}
      namedQueryCount={namedQueryCount}
      signals={settled.signals}
    />
  ) : (
    <SearchInsightsSignalChips ga4Card={ga4Card} namedQueryCount={namedQueryCount} state="error" />
  );
}
