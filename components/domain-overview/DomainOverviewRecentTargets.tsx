"use client";

import type { DomainRecentTarget } from "@/lib/domain-overview/types";
import { relativePast } from "@/lib/format/relative-time";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import { cacheHoursRemaining } from "./domain-overview-workspace-model";

type DomainOverviewRecentTargetsProps = {
  currentTarget?: string;
  onNewSearch?: () => void;
  onOpen: (target: DomainRecentTarget) => void;
  targets: DomainRecentTarget[];
};

function cacheLabel(target: DomainRecentTarget, now: Date) {
  const hours = cacheHoursRemaining(target.cachedUntil, now);
  return hours > 0 ? "cached, free" : relativePast(new Date(target.fetchedAt), now);
}

export function DomainOverviewRecentTargets({
  currentTarget,
  onNewSearch,
  onOpen,
  targets,
}: Readonly<DomainOverviewRecentTargetsProps>) {
  const visible = targets.filter((target) => target.target !== currentTarget).slice(0, 5);
  if (visible.length === 0 && !onNewSearch) return null;
  const now = new Date();

  return (
    <section
      aria-label="Recent domain analyses"
      className="flex items-center gap-2.5 overflow-x-auto pb-1"
    >
      <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
        Recent
      </span>
      {visible.map((target) => (
        <button
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-transparent px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
          key={`${target.target}:${target.scope}:${target.locationCode}:${target.languageCode}`}
          onClick={() => onOpen(target)}
          type="button"
        >
          {target.target}
          <span className="font-mono text-[10.5px] text-green-text">{cacheLabel(target, now)}</span>
        </button>
      ))}
      {onNewSearch ? (
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-fg-muted transition-colors hover:border-accent-text hover:text-accent-text"
          onClick={onNewSearch}
          type="button"
        >
          <Plus aria-hidden size={11} weight="bold" />
          New search
        </button>
      ) : null}
    </section>
  );
}
