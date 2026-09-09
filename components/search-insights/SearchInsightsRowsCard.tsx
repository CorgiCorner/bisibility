"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import type { ReactNode } from "react";
import { COLLAPSE_TITLE } from "./search-insights-copy";
import {
  collapseLabel,
  counterLabel,
  moreLabel,
  moreTitle,
  type RowsShow,
} from "./search-insights-rows-model";

export type SearchInsightsRowsCardProps = {
  caption: ReactNode;
  children?: ReactNode;
  emptyReason?: string;
  /** Control that belongs on the title row, opposite the heading. */
  headerEnd?: ReactNode;
  /** Action that belongs on the expander row, opposite the counter. */
  footerEnd?: ReactNode;
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
  footerEnd,
  headerEnd,
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
  const showPager = !empty && Boolean(collapse || more);
  const showFooter = !empty && (showPager || Boolean(footerEnd));

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-bg-elev">
      <div
        className={cn(
          "flex items-start justify-between gap-2.5 px-4 pb-3 pt-3.5",
          empty && "border-b border-border",
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 min-w-0 text-ui-body-relaxed font-semibold">{title}</h2>
          <div className="min-w-0 text-ui-caption text-fg-muted">{caption}</div>
        </div>
        {headerEnd ? <div className="shrink-0">{headerEnd}</div> : null}
      </div>
      {empty ? (
        <p className="m-0 px-4 py-5 text-ui-body text-fg-muted">{emptyReason}</p>
      ) : (
        <div className="[&_[role=table]]:border-0">{children}</div>
      )}
      {showFooter ? (
        <div className="flex items-center gap-3 px-4 py-2.5">
          {collapse ? (
            <Button onClick={onCollapse} size="xs" title={COLLAPSE_TITLE} variant="secondary">
              {collapse}
            </Button>
          ) : null}
          {more ? (
            <Button
              loading={loading}
              onClick={onMore}
              size="xs"
              startIcon={<CaretDown weight="regular" size={12} />}
              title={moreTitle(show, total)}
              variant="secondary"
            >
              {more}
            </Button>
          ) : null}
          {showPager ? (
            <span className="font-sans tabular-nums text-ui-caption text-fg-muted">{counter}</span>
          ) : null}
          {footerEnd ? <div className="ms-auto shrink-0">{footerEnd}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
