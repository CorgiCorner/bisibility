"use client";

import { relativePast } from "@/lib/format/relative-time";
import { ClockCounterClockwiseIcon as Recent, XIcon as X } from "@phosphor-icons/react";
import {
  type RecentBacklinksTarget,
  recentTargetKey,
  scopeLabel,
} from "./backlinks-workspace-model";

type RecentTargetsProps = {
  onOpen: (target: RecentBacklinksTarget) => void;
  onRemove: (target: RecentBacklinksTarget) => void;
  targets: RecentBacklinksTarget[];
};

function freeFor(cachedUntil: string, now: Date) {
  const milliseconds = new Date(cachedUntil).getTime() - now.getTime();
  const hours = Math.ceil(milliseconds / 3_600_000);
  return hours > 0 ? `cached, free for ${hours}h` : "cache expired";
}

export function RecentTargets({ onOpen, onRemove, targets }: Readonly<RecentTargetsProps>) {
  if (targets.length === 0) return null;
  const now = new Date();

  return (
    <section aria-label="Recent targets">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-faint">
        <Recent aria-hidden size={13} />
        Recent targets
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {targets.map((target) => (
          <div
            className="flex shrink-0 items-center gap-2 rounded-full border border-border-strong bg-bg-elev px-3 py-1.5 transition-colors hover:border-accent"
            key={recentTargetKey(target)}
          >
            <button
              className="flex items-center gap-2 text-left transition-colors"
              onClick={() => onOpen(target)}
              type="button"
            >
              <strong className="max-w-[180px] truncate text-[12px] font-semibold">
                {target.target}
              </strong>
              <span className="font-mono text-[10px] text-fg-faint">
                {scopeLabel(target.targetScope)} - {relativePast(new Date(target.fetchedAt), now)}
              </span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[9.5px] text-accent">
                {freeFor(target.cachedUntil, now)}
              </span>
            </button>
            <button
              aria-label={`Remove ${target.target} from recent targets`}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-fg-faint transition-colors hover:text-fg"
              onClick={() => onRemove(target)}
              type="button"
            >
              <X aria-hidden size={12} weight="bold" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
