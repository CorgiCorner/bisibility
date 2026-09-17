"use client";

import { relativePastFact } from "@/lib/format/relative-time";
import { ClockCounterClockwiseIcon as Recent } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
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

function cacheHours(cachedUntil: string, now: Date) {
  const milliseconds = new Date(cachedUntil).getTime() - now.getTime();
  const hours = Math.ceil(milliseconds / 3_600_000);
  return hours;
}

function relativePastLabel(
  date: Date,
  now: Date,
  t: ReturnType<typeof useTranslations<"projectBacklinks.workspace.snapshot">>,
) {
  const fact = relativePastFact(date, now);
  if (fact.kind === "justNow") return t("relative.justNow");
  if (fact.kind === "yesterday") return t("relative.yesterday");
  if (fact.kind === "minutesAgo") return t("relative.minutesAgo", { count: fact.count });
  if (fact.kind === "hoursAgo") return t("relative.hoursAgo", { count: fact.count });
  return t("relative.daysAgo", { count: fact.count });
}

export function RecentTargets({ onOpen, onRemove, targets }: Readonly<RecentTargetsProps>) {
  const tSnapshot = useTranslations("projectBacklinks.workspace.snapshot");
  const t = useTranslations("projectBacklinks.workspace.recent");
  if (targets.length === 0) return null;
  const now = new Date();

  return (
    <section aria-label={tSnapshot("recentTargetsAria")}>
      <div className="mb-2 flex items-center gap-1.5 font-sans tabular-nums text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
        <Recent weight="regular" aria-hidden size={13} />
        {tSnapshot("recentTargets")}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {targets.map((target) => (
          <div
            className="flex shrink-0 items-center gap-2 rounded-full border border-border-control bg-bg-elev px-3 py-1.5 transition-colors hover:border-accent"
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
              <span className="font-sans tabular-nums text-[10px] text-fg-muted">
                {scopeLabel(target.targetScope)} -{" "}
                {relativePastLabel(new Date(target.fetchedAt), now, tSnapshot)}
              </span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans tabular-nums text-[9.5px] text-accent-text">
                {cacheHours(target.cachedUntil, now) > 0
                  ? t("cached", { hours: cacheHours(target.cachedUntil, now) })
                  : t("expired")}
              </span>
            </button>
            <button
              aria-label={tSnapshot("removeRecent", { target: target.target })}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:text-fg"
              onClick={() => onRemove(target)}
              type="button"
            >
              <X aria-hidden size={12} weight="regular" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
