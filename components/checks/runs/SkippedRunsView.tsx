"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import type { CheckRange, DeferredGroup, DeferredReason } from "@/lib/checks/contract";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/dist/ssr/Gauge";
import { PauseIcon as Pause } from "@phosphor-icons/react/dist/ssr/Pause";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/dist/ssr/PuzzlePiece";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type CheckRunsTranslations, deferredWindow, rangeCaption } from "./check-runs-format";

export type SkippedRunsLinks = {
  connectProviderHref: string;
  reviewProvidersHref: string;
  timelineHref: string;
};

const reasonMeta: Record<
  DeferredReason,
  {
    cta: "viewTimeline" | "connectProvider" | "reviewProviders";
    description:
      | "budgetSkippedDescription"
      | "migrationHoldDescription"
      | "noProviderDescription"
      | "rateLimitedDescription";
    icon: typeof Gauge;
    link: keyof SkippedRunsLinks;
    title:
      | "budgetCapReached"
      | "pausedDuringImport"
      | "noProviderAssigned"
      | "rateLimitedAllProviders";
  }
> = {
  budget_exhausted: {
    cta: "viewTimeline",
    description: "budgetSkippedDescription",
    icon: Gauge,
    link: "timelineHref",
    title: "budgetCapReached",
  },
  migration_hold: {
    cta: "viewTimeline",
    description: "migrationHoldDescription",
    icon: Pause,
    link: "timelineHref",
    title: "pausedDuringImport",
  },
  no_provider: {
    cta: "connectProvider",
    description: "noProviderDescription",
    icon: PuzzlePiece,
    link: "connectProviderHref",
    title: "noProviderAssigned",
  },
  rate_limited: {
    cta: "reviewProviders",
    description: "rateLimitedDescription",
    icon: WarningCircle,
    link: "reviewProvidersHref",
    title: "rateLimitedAllProviders",
  },
};

function GroupCard({
  group,
  dateDisplay,
  links,
  locale,
  now,
  t,
  timeZone,
}: Readonly<{
  dateDisplay: ReturnType<typeof useDateDisplay>;
  group: DeferredGroup;
  links: SkippedRunsLinks;
  now: Date;
  timeZone: string;
  locale: string;
  t: CheckRunsTranslations;
}>) {
  const meta = reasonMeta[group.reason];
  const Icon = meta.icon;
  const quantity =
    group.reason === "no_provider"
      ? t("keywordsEveryScheduledRunSkipped", { count: group.keywordCount })
      : t("checksDeferredWindow", {
          count: group.count,
          window: deferredWindow(group, now, timeZone, dateDisplay, { locale, t }),
        });
  return (
    <article className="flex min-w-0 gap-3 rounded-card border border-border bg-bg-elev p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-bg-sunken text-yellow-text">
        <Icon aria-hidden size={17} weight="regular" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-[13px] font-semibold text-fg">{t(meta.title)}</h3>
        <p className="m-0 mt-0.5 font-sans tabular-nums text-[10.5px] text-fg-muted">{quantity}</p>
        <p className="m-0 mt-2 text-[12px] leading-relaxed text-fg-muted">{t(meta.description)}</p>
        <Link
          className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent-text outline-none hover:text-accent-text focus-visible:underline"
          href={links[meta.link]}
        >
          {t(meta.cta)}
          <CaretRight aria-hidden size={12} weight="regular" />
        </Link>
      </div>
    </article>
  );
}

type SkippedProps = {
  groups: DeferredGroup[];
  links: SkippedRunsLinks;
  now: Date;
  range: CheckRange;
  timeZone: string;
};

export function SkippedRunsView({ groups, links, now, range, timeZone }: Readonly<SkippedProps>) {
  const dateDisplay = useDateDisplay();
  const locale = useLocale();
  const t = useTranslations("projectRankTracker.checks");
  return (
    <section
      aria-label={t("skippedChecks")}
      className="border-border border-t bg-bg-sunken/45 px-4 py-4"
    >
      <p className="m-0 text-[12.5px] leading-relaxed text-fg-muted">
        {t("skippedRunsDescription", { range: rangeCaption(range, t) })}
      </p>
      <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
        {groups.map((group) => (
          <GroupCard
            dateDisplay={dateDisplay}
            group={group}
            key={group.reason}
            links={links}
            now={now}
            timeZone={timeZone}
            locale={locale}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}
