"use client";

import type { DomainRecentTarget } from "@/lib/domain-overview/types";
import { relativePast } from "@/lib/format/relative-time";
import { ClockCounterClockwiseIcon as Clock } from "@phosphor-icons/react";
import { cacheHoursRemaining } from "./domain-overview-workspace-model";

type DomainOverviewRecentTargetsProps = {
  currentTarget?: string;
  onOpen: (target: DomainRecentTarget) => void;
  targets: DomainRecentTarget[];
};

function cacheLabel(target: DomainRecentTarget, now: Date) {
  const hours = cacheHoursRemaining(target.cachedUntil, now);
  return hours > 0 ? `cached, free for ${hours}h` : "cache expired";
}

export function DomainOverviewRecentTargets({
  currentTarget,
  onOpen,
  targets,
}: Readonly<DomainOverviewRecentTargetsProps>) {
  const visible = targets.filter((target) => target.target !== currentTarget).slice(0, 5);
  if (visible.length === 0) return null;
  const now = new Date();

  return (
    <section aria-label="Recent searches">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
        <Clock aria-hidden size={13} /> Recent searches
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visible.map((target) => (
          <button
            className="flex shrink-0 items-center gap-2 rounded-full border border-border-strong bg-bg-elev px-3 py-1.5 text-left transition-colors hover:border-accent"
            key={`${target.target}:${target.scope}:${target.locationCode}:${target.languageCode}`}
            onClick={() => onOpen(target)}
            type="button"
          >
            <strong className="max-w-[180px] truncate text-[12px] font-semibold">
              {target.target}
            </strong>
            <span className="font-mono text-[10px] text-fg-muted">
              {target.scope === "subdomain" ? "Subdomain" : "Whole domain"} -{" "}
              {relativePast(new Date(target.fetchedAt), now)}
            </span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[9.5px] text-accent-text">
              {cacheLabel(target, now)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
