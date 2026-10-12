"use client";

import { UsageMeter } from "@/components/usagekit/usage-meter";
import type { UsageTone } from "@/components/usagekit/usage-motion";
import {
  UsageChevron,
  UsageReveal,
  UsageStatus,
  usageMotion,
} from "@/components/usagekit/usage-motion";
import { usageProgress } from "@/components/usagekit/usage-progress";
import type { ReactNode } from "react";
import { Fragment, useId, useState } from "react";

export type UsageReading = {
  id: string;
  label: string;
  /** Localized reading, such as "28 of 100 searches used" or "No cap". */
  value: string;
  /** Percent of the limit; null when the reading has no limit. */
  percent: number | null;
  partial?: boolean;
  meterLabel?: string;
};
export type UsageReadingGroup = {
  id: string;
  label?: string;
  /** Inactive groups stay readable but recede, such as a funding source not in use. */
  active?: boolean;
  readings: readonly UsageReading[];
  note?: ReactNode;
  empty?: string;
};
export type UsageBreakdownItem = {
  id: string;
  label: string;
  value: string;
  tags?: readonly string[];
};
export const usageConnectionRowLabels = { unknown: "Unknown" };
export type UsageConnectionRowLabels = typeof usageConnectionRowLabels;
export type UsageConnectionRowProps = {
  name: string;
  tags?: readonly string[];
  status?: { label: string; tone: UsageTone };
  /** The reading summarized in the collapsed row, usually the tightest limit. */
  summary?: { value: string; percent: number | null; partial?: boolean };
  groups?: readonly UsageReadingGroup[];
  /** Always visible below the summary, such as delayed reconciliation. */
  notice?: ReactNode;
  notes?: ReactNode;
  breakdown?: readonly UsageBreakdownItem[];
  /** Additional host details shown when the row is open. */
  children?: ReactNode;
  defaultOpen?: boolean;
  /** Position in the list, used to stagger the first settle. */
  index?: number;
  labels?: Partial<UsageConnectionRowLabels>;
};

/** One connection inside UsageOverviewCard: a summary line that unfolds its readings. */
export function UsageConnectionRow({
  name,
  tags = [],
  status,
  summary,
  groups = [],
  notice,
  notes,
  breakdown = [],
  children,
  defaultOpen = false,
  index = 0,
  labels: custom,
}: UsageConnectionRowProps) {
  const labels = { ...usageConnectionRowLabels, ...custom };
  const id = useId();
  // An unknown summary never shows a host figure such as "0%".
  const summaryText =
    summary && usageProgress(summary.percent, summary.partial ?? false).kind === "unknown"
      ? labels.unknown
      : summary?.value;
  const [open, setOpen] = useState(defaultOpen);
  // Each opening remounts the readings so their meters settle in view.
  const [opened, setOpened] = useState(0);
  const toggle = () => {
    if (!open) setOpened(opened + 1);
    setOpen(!open);
  };
  return (
    <li className="min-w-0" data-open={open}>
      <div className="-mx-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-details`}
          onClick={toggle}
          className={`rounded-md py-3.5 hover:bg-bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-accent-solid grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-2 text-left ${usageMotion.respond}`}
        >
          {/* Spaces between the parts keep the accessible name readable in every engine. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-2">
              <span className="text-sm min-w-0 break-words font-semibold">{name}</span>
              {tags.map((tag) => (
                <Fragment key={tag}>
                  {" "}
                  <span className="rounded-full border border-border px-2 py-px text-[11px] leading-4 text-fg-muted inline-flex items-center">
                    {tag}
                  </span>
                </Fragment>
              ))}
            </span>{" "}
            <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              {status && <UsageStatus tone={status.tone}>{status.label}</UsageStatus>}{" "}
              {summary && (
                <span className="flex items-center gap-3">
                  <UsageMeter
                    size="md"
                    percent={summary.percent}
                    partial={summary.partial}
                    delay={120 + index * 70}
                    className="w-16 sm:w-24"
                  />
                  <span className="text-sm min-w-10 text-right font-medium tabular-nums">
                    {summaryText}
                  </span>
                </span>
              )}
            </span>
          </span>
          <UsageChevron open={open} className="text-fg-muted" />
        </button>
      </div>
      {notice && (
        <p className="text-xs/relaxed flex min-w-0 items-start gap-[0.4em] pb-3">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="mt-[0.15em] size-[1.15em] shrink-0 text-yellow-text"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.75v3.75M8 11v.01" />
          </svg>
          <span className="min-w-0 break-words">{notice}</span>
        </p>
      )}
      <UsageReveal open={open} id={`${id}-details`}>
        <div key={opened} className="gap-4 flex min-w-0 flex-col pb-5 pt-1">
          {groups.map((group) => (
            <div
              key={group.id}
              data-active={group.active === false ? "false" : "true"}
              className={`gap-3 flex min-w-0 flex-col ${group.active === false ? "opacity-70" : ""}`}
            >
              {group.label && <p className="text-xs font-medium text-fg-muted">{group.label}</p>}
              {group.readings.length > 0 ? (
                <dl className="grid min-w-0 grid-cols-[minmax(5.5rem,auto)_minmax(3rem,1fr)] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(7rem,auto)_minmax(6rem,1fr)_minmax(0,auto)]">
                  {group.readings.map((reading, at) => (
                    <Fragment key={reading.id}>
                      <dt className="text-xs min-w-0 break-words text-fg-muted">{reading.label}</dt>
                      <dd className="min-w-0">
                        <UsageMeter
                          size="md"
                          percent={reading.percent}
                          partial={reading.partial}
                          label={reading.meterLabel ?? `${name} ${reading.label}`}
                          valueText={reading.value}
                          delay={at * 70}
                        />
                      </dd>
                      <dd
                        className={`text-xs/relaxed col-span-2 min-w-0 break-words tabular-nums sm:col-span-1 sm:text-right ${reading.percent !== null && reading.percent >= 100 ? "text-red-text" : ""}`}
                      >
                        {reading.value}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              ) : (
                group.empty && <p className="text-xs/relaxed text-fg-muted">{group.empty}</p>
              )}
              {group.note && (
                <p className="text-xs/relaxed text-fg-muted tabular-nums">{group.note}</p>
              )}
            </div>
          ))}
          {notes && (
            <div className="text-xs/relaxed flex min-w-0 flex-col gap-1 text-fg-muted">{notes}</div>
          )}
          {breakdown.length > 0 && (
            <dl className="rounded-lg bg-bg-sunken p-4 grid min-w-0 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              {breakdown.map((item) => (
                <div key={item.id} className="min-w-0">
                  <dt className="text-xs text-fg-muted">{item.label}</dt>
                  <dd className="text-sm mt-1 break-words font-semibold tabular-nums">
                    {item.value}
                  </dd>
                  {item.tags && item.tags.length > 0 && (
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border px-2 py-px text-[11px] leading-4 text-fg-muted inline-flex items-center tabular-nums"
                        >
                          {tag}
                        </span>
                      ))}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          )}
          {children}
        </div>
      </UsageReveal>
    </li>
  );
}
