"use client";

import { Button } from "@/components/ui";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { COLLAPSE_TITLE } from "./search-insights-copy";
import {
  collapseLabel,
  counterLabel,
  footerNote,
  moreLabel,
  moreTitle,
  type RowsShow,
} from "./search-insights-rows-model";

export type SearchInsightsRowsCardProps = {
  caption: ReactNode;
  children?: ReactNode;
  emptyReason?: string;
  loading?: boolean;
  onCollapse: () => void;
  onMore: () => void;
  show: RowsShow;
  shown: number;
  title: string;
  total: number;
};

export function SearchInsightsRowsCard({
  caption,
  children,
  emptyReason,
  loading = false,
  onCollapse,
  onMore,
  show,
  shown,
  title,
  total,
}: Readonly<SearchInsightsRowsCardProps>) {
  const empty = total === 0;
  const counter = counterLabel(shown, total);
  const collapse = collapseLabel(show);
  const more = moreLabel(show, total);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex items-baseline justify-between gap-2.5 border-b border-border px-4 pb-3 pt-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-ui-body-relaxed font-semibold">{title}</h2>
          <span className="text-ui-caption text-fg-muted">{caption}</span>
        </div>
        {empty ? null : (
          <span className="shrink-0 px-2 py-0.5 font-sans tabular-nums text-ui-caption text-fg-muted">
            {counter}
          </span>
        )}
      </div>
      {empty ? <p className="m-0 px-4 py-5 text-ui-body text-fg-muted">{emptyReason}</p> : children}
      {!empty && (collapse || more) ? (
        <div className="flex items-center gap-3 px-4 py-2.5">
          {collapse ? (
            <Button onClick={onCollapse} size="sm" title={COLLAPSE_TITLE} variant="secondary">
              {collapse}
            </Button>
          ) : null}
          {more ? (
            <Button
              loading={loading}
              onClick={onMore}
              size="sm"
              startIcon={<CaretDown weight="regular" size={12} />}
              title={moreTitle(show, total)}
              variant="secondary"
            >
              {more}
            </Button>
          ) : null}
          {more ? (
            <span className="font-sans tabular-nums text-ui-caption text-fg-muted">
              {footerNote(shown, total)}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
