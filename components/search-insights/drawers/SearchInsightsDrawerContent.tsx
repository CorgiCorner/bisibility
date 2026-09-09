"use client";

import { DRAWER_COPY, NEUTRAL_COPY } from "@/components/search-insights/search-insights-copy";
import { formatRowCount } from "@/components/search-insights/search-insights-rows-model";
import { Button } from "@/components/ui/Button";
import type { SearchInsightsDay } from "@/lib/search-insights/queries/detail-model";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { ChartDonutIcon as ChartDonut } from "@phosphor-icons/react/dist/csr/ChartDonut";
import {
  type SearchInsightsDrawerContent as DrawerContent,
  drawerBars,
  drawerFrameKey,
  drawerListEmptyCopy,
  drawerListPivot,
  drawerMeasuredZeroLine,
  drawerPagePivotEmptyCopy,
  drawerPivotHeading,
  drawerShowAllLabel,
  drawerShowAllTitle,
  drawerStatCards,
  drawerWindowLabel,
  type SearchInsightsDrawerFrame,
} from "./drawer-model";
import {
  DrawerBandRows,
  DrawerOverlapRows,
  type DrawerRow,
  DrawerSliceRows,
} from "./SearchInsightsDrawerRows";

export type SearchInsightsDrawerContentProps = {
  content: DrawerContent;
  namedQueryCount: number;
  onOpen: (frame: SearchInsightsDrawerFrame) => void;
  onShowAll: () => void;
  seen: ReadonlySet<string>;
};

/**
 * The bars are the window itself: one per day, none of them provisional, and the line under them
 * says where they came from. Opening a drawer costs nothing at the provider, and the copy is what
 * makes that legible rather than merely true.
 */
function ClicksPerDay({ perDay }: Readonly<{ perDay: readonly SearchInsightsDay[] }>) {
  const measuredZero = perDay.length > 0 && perDay.every((day) => day.clicks === 0);
  return (
    <div className="mt-4 rounded-card border border-border px-3.5 py-3.25">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="font-sans tabular-nums text-ui-micro uppercase tracking-wider text-fg-muted">
          {DRAWER_COPY.clicksPerDay}
        </span>
        <span className="font-sans tabular-nums text-ui-caption text-fg-muted">
          {drawerWindowLabel(perDay.length)}
        </span>
      </div>
      <div className="mt-2.75 flex h-13.5 items-end gap-0.75">
        {drawerBars(perDay).map((bar) => (
          <span
            className="min-w-px flex-1 rounded-t-xs bg-border-control"
            key={bar.date}
            style={{ height: `${bar.height}%` }}
            title={bar.title}
          />
        ))}
      </div>
      {measuredZero ? (
        <p className="m-0 mt-2.5 text-ui-caption leading-normal text-fg-muted">
          {drawerMeasuredZeroLine(perDay.length)}
        </p>
      ) : null}
      <p className="m-0 mt-2 text-ui-caption leading-normal text-fg-muted">
        {NEUTRAL_COPY.storedRows}
      </p>
    </div>
  );
}

function StatQuad({ content }: Readonly<{ content: DrawerContent }>) {
  if (content.kind !== "page" && content.kind !== "query") return null;
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {drawerStatCards(content.detail.stats).map((stat) => (
          <div
            className="flex flex-col gap-1 rounded-control border border-border px-2.75 py-2.5"
            key={stat.label}
          >
            <span className="font-sans tabular-nums text-ui-micro uppercase tracking-wider text-fg-muted">
              {stat.label}
            </span>
            <span className="font-sans tabular-nums text-ui-section">{stat.value}</span>
          </div>
        ))}
      </div>
      <ClicksPerDay perDay={content.detail.perDay} />
    </>
  );
}

function sliceRows(content: DrawerContent, onOpen: SearchInsightsDrawerContentProps["onOpen"]) {
  if (content.kind === "query") {
    return content.detail.pages.rows.map(
      (page): DrawerRow => ({
        clicks: page.clicks,
        key: drawerFrameKey({ kind: "page", path: page.path, url: page.url }),
        engagementRate: page.engagementRate,
        keyEvents: page.keyEvents,
        label: page.path,
        onOpen: () => onOpen({ kind: "page", path: page.path, url: page.url }),
        position: page.position,
        title: page.url,
      }),
    );
  }
  if (content.kind === "page") {
    return content.detail.queries.rows.map(
      (query): DrawerRow => ({
        clicks: query.clicks,
        key: drawerFrameKey({ kind: "query", query: query.query }),
        label: query.query,
        onOpen: () => onOpen({ kind: "query", query: query.query }),
        position: query.position,
        title: query.query,
      }),
    );
  }
  return [];
}

function ListEmpty({
  kind,
  namedQueryCount,
}: Readonly<{ kind: "band" | "overlap"; namedQueryCount: number }>) {
  const empty = drawerListEmptyCopy(kind, namedQueryCount);
  return (
    <section className="mt-4.5 rounded-card bg-bg-sunken px-3.5 py-3.25">
      <p className="m-0 text-ui-body leading-normal">{empty.copy}</p>
      <p className="m-0 mt-1.5 text-ui-caption leading-normal text-fg-muted">{empty.definition}</p>
    </section>
  );
}

function Sessions({ content }: Readonly<{ content: DrawerContent }>) {
  if (content.kind !== "page" || typeof content.detail.sessions !== "number") return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-2.5 rounded-card border border-border px-3.5 py-2.75">
      <span className="inline-flex items-center gap-2 text-ui-caption">
        <ChartDonut weight="regular" aria-hidden className="text-fg-muted" size={15} />
        {DRAWER_COPY.sessions}
        <span className="rounded-full bg-bg-sunken px-1.5 font-sans tabular-nums text-ui-micro tracking-wide text-fg-muted">
          GA4
        </span>
      </span>
      <span className="font-sans tabular-nums text-ui-body font-semibold">
        {formatRowCount(content.detail.sessions)}
      </span>
    </div>
  );
}

export function SearchInsightsDrawerContent({
  content,
  namedQueryCount,
  onOpen,
  onShowAll,
  seen,
}: Readonly<SearchInsightsDrawerContentProps>) {
  const heading = drawerPivotHeading(content);
  const isList = content.kind === "band" || content.kind === "overlap";
  const showAll = isList ? drawerShowAllLabel(content.list) : null;
  const showAllTitle = isList ? drawerShowAllTitle(content.list) : undefined;
  const sortTip = isList ? drawerListPivot(content.kind).sortTip : undefined;
  const emptyPagePivot =
    content.kind === "page" && content.detail.queries.rows.length === 0
      ? drawerPagePivotEmptyCopy(content.detail)
      : null;

  if (isList && content.list.total === 0) {
    return <ListEmpty kind={content.kind} namedQueryCount={namedQueryCount} />;
  }

  return (
    <>
      <StatQuad content={content} />
      <section className="mt-4.5">
        <div className="mb-2 flex items-baseline justify-between gap-2.5">
          <h3
            className={`m-0 text-ui-body font-semibold${sortTip ? " cursor-help" : ""}`}
            title={sortTip}
          >
            {heading.title}
          </h3>
          {heading.count ? (
            <span className="font-sans tabular-nums text-ui-micro text-fg-muted">
              {heading.count}
            </span>
          ) : null}
        </div>
        {heading.note ? (
          <p className="m-0 mb-2.25 text-ui-caption leading-normal text-fg-muted">{heading.note}</p>
        ) : null}
        {content.kind === "band" ? (
          <DrawerBandRows
            label={heading.title}
            onOpen={(query) => onOpen({ kind: "query", query })}
            rows={content.list.rows}
            seen={seen}
          />
        ) : null}
        {content.kind === "overlap" ? (
          <DrawerOverlapRows
            label={heading.title}
            onOpen={(query) => onOpen({ kind: "query", query })}
            rows={content.list.rows}
            seen={seen}
          />
        ) : null}
        {emptyPagePivot ? (
          <p className="m-0 text-ui-caption leading-normal text-fg-muted">{emptyPagePivot}</p>
        ) : null}
        {isList || emptyPagePivot ? null : (
          <DrawerSliceRows
            keyEventsConfigured={
              content.kind === "query" ? content.detail.keyEventsConfigured : null
            }
            label={heading.title}
            pageMetricsReadable={content.kind === "query" && content.detail.pageMetricsReadable}
            rows={sliceRows(content, onOpen)}
            seen={seen}
            textHeader={content.kind === "query" ? "Page" : "Query"}
          />
        )}
        {showAll ? (
          <div className="flex pt-2.5">
            <Button
              onClick={onShowAll}
              size="sm"
              startIcon={<CaretDown weight="regular" size={12} />}
              title={showAllTitle}
              variant="secondary"
            >
              {showAll}
            </Button>
          </div>
        ) : null}
      </section>
      <Sessions content={content} />
    </>
  );
}
