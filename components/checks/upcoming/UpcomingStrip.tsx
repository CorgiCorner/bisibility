"use client";

import { ZonedTime } from "@/components/ui";
import type { UpcomingBlockedGroup, UpcomingDayGroup } from "@/lib/checks/contract";
import Drawer from "@mui/material/Drawer";
import {
  CaretRightIcon as CaretRight,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useState } from "react";
import {
  blockedChipLabel,
  formatCheckCount,
  formatCount,
  formatEstimatedCost,
} from "./upcoming-format";

export type UpcomingStripProps = {
  blocked: UpcomingBlockedGroup[];
  days: UpcomingDayGroup[];
  initialOpenDayKey?: string;
  schedulesHref: string;
  timeZone: string;
};

export function UpcomingStrip({
  blocked,
  days,
  initialOpenDayKey,
  schedulesHref,
  timeZone,
}: Readonly<UpcomingStripProps>) {
  const [openDayKey, setOpenDayKey] = useState(initialOpenDayKey ?? null);
  const titleId = useId();
  const openDay = days.find((day) => day.key === openDayKey) ?? null;
  const blockerLabel = blockedChipLabel(blocked);
  const hasNeverRun = blocked.some((group) => group.reason === "no_provider");

  return (
    <>
      <section aria-label="Upcoming checks" className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        {blockerLabel ? (
          <span
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
              hasNeverRun
                ? "border-red/30 bg-red/8 text-red-text"
                : "border-border-strong bg-bg-elev text-fg-muted"
            }`}
          >
            <WarningCircle
              aria-hidden
              className={hasNeverRun ? "text-red-text" : "text-fg-muted"}
              size={14}
              weight="fill"
            />
            {blockerLabel}
          </span>
        ) : null}
        {days.map((day) => (
          <button
            aria-label={`${day.label}, ${formatCheckCount(day.count)}, about ${formatEstimatedCost(
              day.estimatedCostCents,
            )}`}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-border-strong bg-bg-elev px-3 text-xs font-semibold text-fg outline-none transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text"
            key={day.key}
            onClick={() => setOpenDayKey(day.key)}
            type="button"
          >
            {day.label} {formatCount(day.count)} · {formatEstimatedCost(day.estimatedCostCents)}
          </button>
        ))}
      </section>

      <Drawer
        anchor="bottom"
        onClose={() => setOpenDayKey(null)}
        open={openDay !== null}
        slotProps={{
          backdrop: {
            "aria-label": "Close upcoming details",
            sx: { backgroundColor: "rgba(20,16,8,.42)" },
          },
          paper: {
            "aria-labelledby": titleId,
            "aria-modal": "true",
            role: "dialog",
            sx: {
              backgroundColor: "var(--bg-elev)",
              borderColor: "var(--border-strong)",
              borderRadius: "18px 18px 0 0",
              borderTop: "1px solid var(--border-strong)",
              boxShadow: "none",
              color: "var(--fg)",
              height: "min(76vh, 420px)",
              maxHeight: "76vh",
              overflow: "hidden",
            },
          },
        }}
      >
        {openDay ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div aria-hidden className="flex justify-center pb-0.5 pt-2">
              <span className="h-1 w-[38px] rounded-sm bg-border-strong" />
            </div>
            <header className="flex items-start justify-between gap-3 border-border border-b px-5 pb-4 pt-3">
              <div className="min-w-0">
                <h2 className="m-0 text-[17px] font-semibold leading-tight text-fg" id={titleId}>
                  {openDay.label}
                </h2>
                <p className="mb-0 mt-1 font-mono text-[11px] text-fg-muted">
                  {formatCheckCount(openDay.count)} ·{" "}
                  {formatEstimatedCost(openDay.estimatedCostCents)} est.
                </p>
              </div>
              <button
                aria-label="Close sheet"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-bg-sunken focus-visible:bg-bg-sunken"
                onClick={() => setOpenDayKey(null)}
                type="button"
              >
                <X aria-hidden size={18} weight="bold" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ul className="m-0 list-none space-y-3">
                {openDay.samples.slice(0, 3).map((sample) => (
                  <li
                    className="flex min-w-0 items-center justify-between gap-4 border-border-soft border-b pb-3 text-[13px] last:border-b-0 last:pb-0"
                    key={`${sample.keywordId}-${sample.nextCheckAt}`}
                  >
                    <span className="truncate text-fg">{sample.keyword}</span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                      <ZonedTime timeZone={timeZone} value={sample.nextCheckAt} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <footer className="border-border border-t px-5 py-4">
              <Link
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text outline-none hover:underline focus-visible:underline"
                href={schedulesHref}
              >
                Manage schedules in Keywords
                <CaretRight aria-hidden size={12} weight="bold" />
              </Link>
            </footer>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
