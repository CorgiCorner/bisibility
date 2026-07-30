"use client";

import type { UpcomingDayGroup } from "@/lib/checks/contract";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { formatCheckCount, formatEstimatedCost, fuzzySampleTime } from "./upcoming-format";

export type UpcomingDayRollupsProps = {
  days: UpcomingDayGroup[];
  initialExpandedDayKey?: string;
  mode: "rail" | "slim";
  now: Date;
  schedulesHref: string;
  timeZone: string;
};

const manageLinkClassName =
  "text-xs font-semibold text-accent outline-none hover:underline focus-visible:underline";

function DaySummary({ day }: Readonly<{ day: UpcomingDayGroup }>) {
  return (
    <>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[13px] font-semibold text-fg">{day.label}</span>
        <span className="mt-0.5 block font-mono text-[10.5px] text-fg-faint">
          {formatCheckCount(day.count)}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[11px] font-semibold text-fg-muted">
        {formatEstimatedCost(day.estimatedCostCents)} est.
      </span>
    </>
  );
}

function SampleRows({
  day,
  now,
  timeZone,
}: Readonly<{ day: UpcomingDayGroup; now: Date; timeZone: string }>) {
  return (
    <ul className="m-0 list-none space-y-2 border-border-soft border-t px-3.5 py-3">
      {day.samples.slice(0, 3).map((sample) => (
        <li
          className="flex min-w-0 items-center justify-between gap-3 text-xs"
          key={`${sample.keywordId}-${sample.nextCheckAt}`}
        >
          <span className="truncate text-fg-muted">{sample.keyword}</span>
          <span className="shrink-0 font-mono text-[10.5px] text-fg-faint">
            {fuzzySampleTime(sample.nextCheckAt, day.label, now, timeZone)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function UpcomingDayRollups({
  days,
  initialExpandedDayKey,
  mode,
  now,
  schedulesHref,
  timeZone,
}: Readonly<UpcomingDayRollupsProps>) {
  const [expandedDayKey, setExpandedDayKey] = useState(initialExpandedDayKey ?? null);

  if (mode === "slim") {
    return (
      <section aria-label="Upcoming days">
        <div className="grid grid-cols-2 gap-2">
          {days.map((day) => (
            <article
              className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-bg-elev px-3.5 py-3"
              key={day.key}
            >
              <DaySummary day={day} />
            </article>
          ))}
        </div>
        <Link className={`${manageLinkClassName} mt-3 inline-block`} href={schedulesHref}>
          Manage schedules in Keywords →
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Upcoming days" className="space-y-2">
      {days.map((day) => {
        const expanded = day.key === expandedDayKey;
        const detailsId = `upcoming-day-${day.key}`;
        return (
          <article
            className="overflow-hidden rounded-xl border border-border bg-bg-elev"
            key={day.key}
          >
            <button
              aria-controls={detailsId}
              aria-expanded={expanded}
              className="flex min-h-14 w-full items-center gap-3 px-3.5 py-3 outline-none transition-colors hover:bg-bg-sunken/65 focus-visible:bg-bg-sunken/65"
              onClick={() => setExpandedDayKey(expanded ? null : day.key)}
              type="button"
            >
              <DaySummary day={day} />
              <CaretDown
                aria-hidden
                className={`shrink-0 text-fg-faint transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
                size={14}
                weight="bold"
              />
            </button>
            {expanded ? (
              <div id={detailsId}>
                <SampleRows day={day} now={now} timeZone={timeZone} />
                <div className="border-border-soft border-t px-3.5 py-2.5">
                  <Link className={manageLinkClassName} href={schedulesHref}>
                    Manage schedules in Keywords →
                  </Link>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
