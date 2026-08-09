"use client";

import { relativePast } from "@/lib/format/relative-time";
import {
  cacheTimeRemaining,
  type RecentKeywordResearch,
} from "@/lib/keyword-research/recent-searches";
import { ClockCounterClockwiseIcon as Clock, XIcon as X } from "@phosphor-icons/react";

type RecentResearchSearchesProps = {
  disabled?: boolean;
  disabledHint?: string;
  onOpen: (search: RecentKeywordResearch) => void;
  onRemove: (search: RecentKeywordResearch) => void;
  searches: RecentKeywordResearch[];
};

function freeFor(value: string) {
  const hours = Math.ceil(cacheTimeRemaining(value) / 3_600_000);
  return hours > 0 ? `cached, free for ${hours}h` : "cache expired";
}

export function RecentResearchSearches({
  disabled = false,
  disabledHint,
  onOpen,
  onRemove,
  searches,
}: Readonly<RecentResearchSearchesProps>) {
  if (searches.length === 0) return null;
  const hintId = disabled && disabledHint ? "recent-research-disabled-hint" : undefined;
  const now = new Date();
  return (
    <section aria-label="Recent searches">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
        <Clock size={13} /> Recent searches
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {searches.map((search) => (
          <div
            className="flex shrink-0 items-center gap-2 rounded-full border border-border-strong bg-bg-elev px-3 py-1.5 transition-colors hover:border-accent"
            key={`${search.createdAt}-${search.seed}`}
          >
            <button
              aria-describedby={hintId}
              className="flex items-center gap-2 text-left transition-colors disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
              disabled={disabled}
              onClick={() => onOpen(search)}
              type="button"
            >
              <strong className="max-w-[180px] truncate text-[12px] font-semibold">
                {search.seed}
              </strong>
              <span className="font-mono text-[10px] text-fg-muted">
                {search.market} - {relativePast(new Date(search.createdAt), now)}
              </span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[9.5px] text-accent-text">
                {freeFor(search.cachedUntil)}
              </span>
            </button>
            <button
              aria-label={`Remove ${search.seed} from recent searches`}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:text-fg"
              onClick={() => onRemove(search)}
              type="button"
            >
              <X aria-hidden size={12} weight="bold" />
            </button>
          </div>
        ))}
      </div>
      {hintId ? (
        <p className="mb-0 mt-2 text-[11.5px] text-fg-muted" id={hintId}>
          {disabledHint}
        </p>
      ) : null}
    </section>
  );
}
