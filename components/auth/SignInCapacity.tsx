"use client";

import { InfoTooltip } from "@/components/ui";
import type {
  CapacityMeter as CapacityMeterValue,
  EmailCapacityConstraint,
} from "@/lib/auth/signin-capacity-types";
import { DOCS_URL } from "@/lib/site/site";
import {
  HardDrivesIcon as HardDrives,
  HourglassLowIcon as HourglassLow,
  MoonStarsIcon as MoonStars,
} from "@phosphor-icons/react";

const SELF_HOSTING_URL = `${DOCS_URL}/self-hosting`;

function meterColor({ cap, left }: CapacityMeterValue) {
  const ratio = cap > 0 ? left / cap : 0;
  if (ratio <= 0.15) return "var(--red)";
  if (ratio <= 0.35) return "var(--yellow)";
  return "#8aa07a";
}

export function CapacityMeter({
  compact = false,
  label,
  meter,
  tooltip,
}: Readonly<{
  compact?: boolean;
  label: string;
  meter: CapacityMeterValue;
  tooltip: string;
}>) {
  const percentage = meter.cap > 0 ? Math.max(4, Math.round((meter.left / meter.cap) * 100)) : 4;

  return (
    <div
      className={`${compact ? "mt-1.5" : "mt-2.5"} flex items-center justify-center gap-[9px] px-0.5`}
    >
      <span className="h-[3px] w-11 shrink-0 overflow-hidden rounded-full bg-bg-inset">
        <span
          className="block h-full rounded-full"
          style={{ background: meterColor(meter), width: `${percentage}%` }}
        />
      </span>
      <span className="inline-flex items-center whitespace-nowrap font-mono text-[11px] text-fg-faint">
        {label}
        <span className="ml-[5px] inline-flex">
          <InfoTooltip text={tooltip} />
        </span>
      </span>
    </div>
  );
}

export function GoogleCapacityNote({ justMissed }: Readonly<{ justMissed: boolean }>) {
  return (
    <p
      className={`mt-1.5 mb-0 px-0.5 text-center text-xs leading-[1.55] ${
        justMissed ? "text-red" : "text-fg-faint"
      }`}
    >
      {justMissed ? (
        <>
          <strong className="font-semibold">Just missed it.</strong> The last Google sign-up spots
          were taken a moment ago. Existing Google accounts still work - or use email below.
        </>
      ) : (
        <>
          New Google sign-ups are full while Google reviews our verification request. Existing
          Google accounts still work - or use email below.
        </>
      )}
    </p>
  );
}

export function EmailCapacityPanel({
  binding,
  justMissed,
}: Readonly<{ binding: EmailCapacityConstraint; justMissed: boolean }>) {
  const monthly = binding === "monthly";
  return (
    <>
      {justMissed ? (
        <div className="mb-2.5 flex items-start gap-2.5 rounded-[11px] border border-red/25 bg-accent-soft px-3.5 py-3">
          <HourglassLow aria-hidden className="mt-px shrink-0 text-red" size={16} weight="fill" />
          <p className="m-0 text-[12.5px] leading-[1.55] text-red">
            <strong className="font-semibold">Just missed it.</strong> The last login codes went out
            while you were on this page - nothing was sent to your address.
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-bg-sunken px-4 py-[18px]">
        <div className="flex items-start gap-[11px]">
          <MoonStars aria-hidden className="mt-px shrink-0 text-yellow" size={18} weight="fill" />
          <p className="m-0 text-[13px] leading-[1.6] text-fg-muted">
            <strong className="font-semibold text-fg">
              {monthly
                ? "All of this month's login codes are used up."
                : "All of today's login codes are used up."}
            </strong>{" "}
            {monthly
              ? "More free up at the start of next month (UTC) - come back later, or run bisibility yourself. It's open source."
              : "More free up within 24 hours - come back later, or run bisibility yourself. It's open source."}
          </p>
        </div>
        <a
          className="flex items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-bg-elev p-[11px] text-[13.5px] font-semibold text-fg no-underline hover:border-fg-faint"
          href={SELF_HOSTING_URL}
          rel="noreferrer noopener"
          target="_blank"
        >
          <HardDrives aria-hidden size={16} />
          Self-hosting guide
        </a>
      </div>
    </>
  );
}

export function FullCapacityCard({
  emailBinding,
}: Readonly<{ emailBinding: EmailCapacityConstraint }>) {
  const monthly = emailBinding === "monthly";
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="grid h-[54px] w-[54px] place-items-center rounded-full bg-accent-soft text-yellow">
        <MoonStars aria-hidden size={28} weight="fill" />
      </span>
      <div>
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.7px]">
          {monthly ? "We're at capacity this month" : "We're at capacity today"}
        </h1>
        <p className="mt-2.5 mb-0 text-[14px] leading-[1.6] text-fg-muted">
          {monthly
            ? "We've hit our current sign-up limits: Google sign-up spots are taken and this month's login codes are used up. More codes free up at the start of next month (UTC)."
            : "We've hit our current sign-up limits: Google sign-up spots are taken and today's login codes are used up. More codes free up within 24 hours."}
        </p>
      </div>
      <div className="mt-1 flex w-full flex-col gap-[9px]">
        <a
          className="flex items-center justify-center gap-2 rounded-[10px] bg-accent p-3 text-[14px] font-semibold text-white no-underline hover:bg-accent-hover"
          href={SELF_HOSTING_URL}
          rel="noreferrer noopener"
          target="_blank"
        >
          <HardDrives aria-hidden size={16} />
          Self-host bisibility - it&apos;s open source
        </a>
        <a
          className="flex items-center justify-center rounded-[10px] border border-border-strong bg-transparent p-[11px] text-[13.5px] font-semibold text-fg-muted no-underline hover:bg-bg-sunken"
          href="/login"
        >
          Come back later
        </a>
      </div>
    </div>
  );
}

// A zero count is worse than no line at all: it advertises a dead sign-up day.
export function JoinedToday({ count }: Readonly<{ count: number }>) {
  if (count <= 0) {
    return null;
  }
  return (
    <p className="mt-3.5 mb-0 text-center font-mono text-[11.5px] text-fg-faint">
      {count === 1 ? "1 person joined today" : `${count} people joined today`}
    </p>
  );
}
