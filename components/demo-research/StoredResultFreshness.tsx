"use client";

import { ClockIcon as Clock } from "@phosphor-icons/react/dist/csr/Clock";

export type StoredResultFreshness = {
  fetchedAt: string;
  freshUntil: string;
  stale: boolean;
};

function collectedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "unknown time"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function StoredResultFreshness({ fetchedAt, stale }: Readonly<StoredResultFreshness>) {
  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-full border border-border bg-bg-sunken px-2.5 py-1 text-[11px] text-fg-muted"
      data-testid="stored-result-freshness"
    >
      <Clock aria-hidden size={11} weight="regular" />
      <span>Stored result</span>
      <span aria-hidden>·</span>
      <span>Collected {collectedAt(fetchedAt)}</span>
      <span aria-hidden>·</span>
      <span className={stale ? "text-yellow-text" : "text-green-text"}>
        {stale ? "Past refresh window" : "Fresh for 30 days"}
      </span>
    </span>
  );
}
