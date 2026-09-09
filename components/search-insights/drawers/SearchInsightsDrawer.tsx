"use client";

import { DRAWER_COPY, TRACK_DIALOG_COPY } from "@/components/search-insights/search-insights-copy";
import { AppDrawer, type AppDrawerCloseReason } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { pageHref } from "@/lib/search-insights/queries/top-rows-model";
import { trackedKey } from "@/lib/search-insights/queries/tracked-model";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import type { ReactNode, RefObject } from "react";
import {
  drawerGoogleSearchHref,
  drawerKicker,
  drawerTitle,
  type SearchInsightsDrawerEntry,
  type SearchInsightsDrawerFrame,
  type SearchInsightsListCounts,
} from "./drawer-model";
import { SearchInsightsDrawerContent } from "./SearchInsightsDrawerContent";

export type SearchInsightsDrawerProps = {
  /** The queries with a Rank Tracker write in flight, so the footer cannot start a second one. */
  adding: ReadonlySet<string>;
  /** Title of the frame Back would return to, or nothing when this is the first one. */
  back: string | null;
  bodyRef: RefObject<HTMLDivElement | null>;
  canTrack: boolean;
  counts: SearchInsightsListCounts;
  entry: SearchInsightsDrawerEntry | undefined;
  frame: SearchInsightsDrawerFrame | null;
  namedQueryCounts: SearchInsightsListCounts;
  onBack: () => void;
  onClose: (reason?: AppDrawerCloseReason) => void;
  onExited: () => void;
  onOpen: (frame: SearchInsightsDrawerFrame) => void;
  onRetry: () => void;
  onShowAll: () => void;
  onTrack: (query: string) => void;
  open: boolean;
  seen: ReadonlySet<string>;
  /** Queries this session already added, so the footer answers before the server reloads. */
  tracked: ReadonlySet<string>;
};

const KICKER = "font-sans tabular-nums text-ui-micro uppercase tracking-wider text-fg-muted";

const QUERY_SOURCE_TOOLTIP =
  "Opens this search on Google. What you see can differ from what Search Console measured - results vary by location, device, and personalization.";

function querySourceAction(frame: SearchInsightsDrawerFrame): ReactNode {
  if (frame.kind !== "query") return null;
  return (
    <Tooltip content={QUERY_SOURCE_TOOLTIP} semantics="description">
      <a
        aria-label={`Search Google for ${frame.query}`}
        className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-control border border-border-control opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        href={drawerGoogleSearchHref(frame.query)}
        onClick={(event) => event.stopPropagation()}
        rel="noopener noreferrer"
        target="_blank"
      >
        <ArrowSquareOut aria-hidden size={12} weight="regular" />
      </a>
    </Tooltip>
  );
}

/**
 * A plain function rather than a component, because a list frame has no footer at all and the
 * panel must not paint an empty bar under it.
 */
function footerFor({
  adding,
  canTrack,
  entry,
  frame,
  onTrack,
  tracked,
}: Pick<
  SearchInsightsDrawerProps,
  "adding" | "canTrack" | "entry" | "frame" | "onTrack" | "tracked"
>): ReactNode {
  if (!frame) return null;
  if (frame.kind === "page") {
    const href = pageHref(frame.url);
    if (!href) return null;
    return (
      <Button
        className="max-w-full whitespace-normal text-center"
        endIcon={<ArrowUpRight size={14} weight="regular" />}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
        variant="secondary"
      >
        {DRAWER_COPY.openPage}
      </Button>
    );
  }
  if (frame.kind !== "query") return null;
  const content = entry?.status === "ready" ? entry.content : null;
  const isTracked =
    tracked.has(trackedKey(frame.query)) || (content?.kind === "query" && content.detail.tracked);
  // A write already in flight says so here as well as in the row it came from, because a second
  // confirm would send the same query twice.
  if (adding.has(frame.query) || isTracked) {
    return (
      <span className="inline-flex max-w-full items-center justify-center gap-2 rounded-control border border-border px-3.75 py-2.5 text-center text-ui-body font-semibold text-fg-muted">
        {isTracked ? <Check aria-hidden size={14} weight="regular" /> : null}
        {isTracked ? DRAWER_COPY.tracked : TRACK_DIALOG_COPY.adding}
      </span>
    );
  }
  if (!canTrack) return null;
  return (
    <Button
      onClick={() => onTrack(frame.query)}
      className="max-w-full whitespace-normal text-center"
      startIcon={<Plus size={14} weight="regular" />}
    >
      {DRAWER_COPY.track}
    </Button>
  );
}

/**
 * One panel for the whole stack: opening a row inside it swaps the frame rather than layering a
 * second surface, and the arrow above the title says which frame Back returns to. Escape is
 * handled where the stack lives, because only there does "back" differ from "close".
 */
export function SearchInsightsDrawer({
  adding,
  back,
  bodyRef,
  canTrack,
  counts,
  entry,
  frame,
  namedQueryCounts,
  onBack,
  onClose,
  onExited,
  onOpen,
  onRetry,
  onShowAll,
  onTrack,
  open,
  seen,
  tracked,
}: Readonly<SearchInsightsDrawerProps>) {
  const footer = footerFor({ adding, canTrack, entry, frame, onTrack, tracked });

  return (
    <AppDrawer
      autoFocusClose
      bodyRef={bodyRef}
      footer={footer ? <div className="flex min-w-0 justify-end">{footer}</div> : null}
      headerLeading={
        back ? (
          <button
            className={`flex max-w-full items-center gap-1.75 border-0 bg-transparent p-0 text-left hover:text-fg ${KICKER}`}
            onClick={onBack}
            type="button"
          >
            <ArrowLeft aria-hidden className="shrink-0" size={12} weight="regular" />
            <span className="min-w-0 truncate">{back}</span>
          </button>
        ) : (
          <span className={KICKER}>{frame ? drawerKicker(frame) : ""}</span>
        )
      }
      onClose={onClose}
      onExited={onExited}
      open={open}
      sheetOnMobile
      title={frame ? drawerTitle(frame, entry, counts) : ""}
      titleAction={frame ? querySourceAction(frame) : null}
    >
      {entry?.status === "ready" ? (
        <SearchInsightsDrawerContent
          content={entry.content}
          namedQueryCount={
            entry.content.kind === "band" || entry.content.kind === "overlap"
              ? namedQueryCounts[entry.content.kind]
              : 0
          }
          onOpen={onOpen}
          onShowAll={onShowAll}
          seen={seen}
        />
      ) : null}
      {entry?.status === "failed" ? (
        <div className="flex flex-col items-start gap-2.5">
          <p className="m-0 text-ui-body text-fg-muted">{DRAWER_COPY.failed}</p>
          <Button onClick={onRetry} size="sm" variant="secondary">
            {DRAWER_COPY.retry}
          </Button>
        </div>
      ) : null}
      {entry?.status === "loading" || entry === undefined ? (
        <div className="flex flex-col gap-2" role="status">
          <span className="sr-only">{DRAWER_COPY.loading}</span>
          <span className="h-16.5 animate-pulse rounded-control bg-bg-sunken" />
          <span className="h-13.5 animate-pulse rounded-card bg-bg-sunken" />
          <span className="h-27.5 animate-pulse rounded-card bg-bg-sunken" />
        </div>
      ) : null}
    </AppDrawer>
  );
}
