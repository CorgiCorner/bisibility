"use client";

import { AppDrawer, type AppDrawerCloseReason } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { pageHref } from "@/lib/search-insights/queries/top-rows-model";
import { trackedKey } from "@/lib/search-insights/queries/tracked-model";
import { searchConsoleQueryHref } from "@/lib/search-insights/search-console-link";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useFormatter, useTranslations } from "next-intl";
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
  property?: string;
  seen: ReadonlySet<string>;
  /** Queries this session already added, so the footer answers before the server reloads. */
  tracked: ReadonlySet<string>;
};

const KICKER = "font-sans tabular-nums text-ui-micro uppercase tracking-wider text-fg-muted";

type DrawerFooterProps = Pick<
  SearchInsightsDrawerProps,
  "adding" | "canTrack" | "entry" | "frame" | "onTrack" | "tracked"
> & {
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;
};

function querySourceAction(
  frame: SearchInsightsDrawerFrame,
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
): ReactNode {
  if (frame.kind !== "query") return null;
  return (
    <Tooltip content={t("drawerQuerySourceTooltip")} semantics="description">
      <a
        aria-label={t("searchGoogleForQuery", { query: frame.query })}
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
  t,
}: DrawerFooterProps): ReactNode {
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
        {t("drawerOpenPage")}
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
        {isTracked ? t("drawerTracked") : t("adding")}
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
      {t("drawerTrack")}
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
  property,
  seen,
  tracked,
}: Readonly<SearchInsightsDrawerProps>) {
  const format = useFormatter();
  const t = useTranslations("projectSearchInsights.copy");
  const presentation = { formatNumber: format.number, t };
  const footer = footerFor({ adding, canTrack, entry, frame, onTrack, t, tracked });
  const queryDetail =
    entry?.status === "ready" && entry.content.kind === "query" ? entry.content.detail : null;
  const days = queryDetail?.perDay;
  const start = days?.[0]?.date;
  const end = days?.at(-1)?.date;
  const consoleHref =
    property && frame?.kind === "query" && queryDetail?.query === frame.query && start && end
      ? searchConsoleQueryHref(property, frame.query, { start, end })
      : null;

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
          <span className={KICKER}>{frame ? drawerKicker(frame, presentation) : ""}</span>
        )
      }
      onClose={onClose}
      onExited={onExited}
      open={open}
      sheetOnMobile
      title={frame ? drawerTitle(frame, entry, counts, presentation) : ""}
      titleAction={frame ? querySourceAction(frame, t) : null}
    >
      {consoleHref ? (
        <div className="mb-4 flex min-w-0 justify-end">
          <Button
            endIcon={<ArrowSquareOut aria-hidden size={14} weight="regular" />}
            href={consoleHref}
            rel="noopener noreferrer"
            size="sm"
            target="_blank"
            variant="secondary"
          >
            {t("openInSearchConsole")}
          </Button>
        </div>
      ) : null}
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
          <p className="m-0 text-ui-body text-fg-muted">{t("drawerOpenFailed")}</p>
          <Button onClick={onRetry} size="sm" variant="secondary">
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {entry?.status === "loading" || entry === undefined ? (
        <div className="flex flex-col gap-2" role="status">
          <span className="sr-only">{t("drawerLoading")}</span>
          <span className="h-16.5 animate-pulse rounded-control bg-bg-sunken" />
          <span className="h-13.5 animate-pulse rounded-card bg-bg-sunken" />
          <span className="h-27.5 animate-pulse rounded-card bg-bg-sunken" />
        </div>
      ) : null}
    </AppDrawer>
  );
}
