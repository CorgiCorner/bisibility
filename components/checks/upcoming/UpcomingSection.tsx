"use client";

import { Card, EmptyState, MonoText, SectionTitle } from "@/components/ui";
import type { UpcomingView } from "@/lib/checks/contract";
import {
  CalendarBlankIcon as CalendarBlank,
  CalendarCheckIcon as CalendarCheck,
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
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-dashed border-border-strong bg-bg-elev px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
          <CalendarBlank aria-hidden className="shrink-0 text-fg-muted" size={16} />
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
          <CaretRight aria-hidden size={12} weight="bold" />
        </Link>
      }
      compact
      description="Set a schedule in Keywords to see the next checks here."
      icon={<CalendarBlank aria-hidden size={22} weight="duotone" />}
      title="No scheduled keywords"
    />
  );
}

function UpcomingHeader() {
  return (
    <div className="flex items-start gap-3 border-border border-b px-4 py-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-bg-sunken text-accent-text">
        <CalendarCheck aria-hidden size={17} weight="fill" />
      </span>
      <div className="min-w-0">
        <SectionTitle>Upcoming</SectionTitle>
        <MonoText className="truncate" muted>
          Forecast
        </MonoText>
      </div>
    </div>
  );
}

export function UpcomingSection({
  initialExpandedDayKey,
  initialOpenDayKey,
  mode,
  now = new Date(),
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
          now={now}
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
              now={now}
              schedulesHref={schedulesHref}
              timeZone={timeZone}
            />
          ) : null}
        </div>
      </Card>
      {view.forecast ? (
        <Card size="md">
          <BudgetForecastNote forecast={view.forecast} />
        </Card>
      ) : null}
    </aside>
  );
}
