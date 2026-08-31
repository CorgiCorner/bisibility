"use client";

import { Card, EmptyState, MonoText, SectionTitle } from "@/components/ui";
import type { UpcomingView } from "@/lib/checks/contract";
import {
  CalendarBlankIcon as CalendarBlank,
  CaretRightIcon as CaretRight,
} from "@phosphor-icons/react";
import Link from "next/link";
import { BudgetForecastNote } from "./BudgetForecastNote";
import { UpcomingBlockedAlerts } from "./UpcomingBlockedAlerts";
import { UpcomingDayRollups } from "./UpcomingDayRollups";
import { UpcomingStrip } from "./UpcomingStrip";

export type UpcomingDisplayMode = "rail" | "slim" | "strip";

export type UpcomingSectionProps = {
  initialExpandedDayKey?: string;
  initialOpenDayKey?: string;
  mode: UpcomingDisplayMode;
  /** @deprecated Replaced by ZonedTime absolute formatting; kept for backward compatibility. */
  now?: Date;
  providerSettingsHref: string;
  schedulesHref: string;
  timeZone?: string;
  timelineHref: string;
  view: UpcomingView;
};

function EmptyUpcoming({
  mode,
  schedulesHref,
}: Readonly<{ mode: UpcomingDisplayMode; schedulesHref: string }>) {
  if (mode === "strip") {
    return (
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-card border border-dashed border-border bg-bg-elev px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
          <CalendarBlank
            weight="regular"
            aria-hidden
            className="shrink-0 text-fg-muted"
            size={16}
          />
          No scheduled keywords
        </span>
        <Link
          className="shrink-0 text-xs font-semibold text-accent-text outline-none hover:underline focus-visible:underline"
          href={schedulesHref}
        >
          Manage
        </Link>
      </div>
    );
  }

  return (
    <EmptyState
      action={
        <Link
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text outline-none hover:underline focus-visible:underline"
          href={schedulesHref}
        >
          Manage schedules in Keywords
          <CaretRight aria-hidden size={12} weight="regular" />
        </Link>
      }
      compact
      description="Set a schedule in Keywords to see the next checks here."
      icon={<CalendarBlank aria-hidden size={22} weight="regular" />}
      title="No scheduled keywords"
    />
  );
}

function UpcomingHeader() {
  return (
    <div className="border-border border-b px-4 py-3.5">
      <SectionTitle>Upcoming</SectionTitle>
      <MonoText className="truncate" muted>
        Forecast
      </MonoText>
    </div>
  );
}

export function UpcomingSection({
  initialExpandedDayKey,
  initialOpenDayKey,
  mode,
  providerSettingsHref,
  schedulesHref,
  timeZone = "UTC",
  timelineHref,
  view,
}: Readonly<UpcomingSectionProps>) {
  const empty = view.blocked.length === 0 && view.days.length === 0;

  if (empty) {
    return (
      <aside aria-label="Upcoming checks">
        {mode === "strip" ? (
          <EmptyUpcoming mode={mode} schedulesHref={schedulesHref} />
        ) : (
          <Card className="overflow-hidden p-0" size="md">
            <UpcomingHeader />
            <div className="p-4">
              <EmptyUpcoming mode={mode} schedulesHref={schedulesHref} />
            </div>
          </Card>
        )}
      </aside>
    );
  }

  if (mode === "strip") {
    return (
      <aside aria-label="Upcoming checks">
        <UpcomingStrip
          blocked={view.blocked}
          days={view.days}
          initialOpenDayKey={initialOpenDayKey}
          schedulesHref={schedulesHref}
          timeZone={timeZone}
        />
      </aside>
    );
  }

  return (
    <aside aria-label="Upcoming checks" className="space-y-3">
      <Card className="overflow-hidden p-0" size="md">
        <UpcomingHeader />
        <div className="space-y-3 p-4">
          <UpcomingBlockedAlerts
            blocked={view.blocked}
            providerSettingsHref={providerSettingsHref}
            timelineHref={timelineHref}
          />
          {view.days.length > 0 ? (
            <UpcomingDayRollups
              days={view.days}
              initialExpandedDayKey={initialExpandedDayKey}
              mode={mode}
              schedulesHref={schedulesHref}
              timeZone={timeZone}
            />
          ) : null}
        </div>
      </Card>
      {view.forecast && view.forecast.next48hCents > 0 ? (
        <Card size="md">
          <BudgetForecastNote forecast={view.forecast} />
        </Card>
      ) : null}
    </aside>
  );
}
