"use client";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type {
  CapacityMeter as CapacityMeterValue,
  EmailCapacityConstraint,
} from "@/lib/auth/signin-capacity-types";
import { DOCS_URL } from "@/lib/site/site";
import { HardDrivesIcon as HardDrives } from "@phosphor-icons/react/dist/csr/HardDrives";
import { HourglassLowIcon as HourglassLow } from "@phosphor-icons/react/dist/csr/HourglassLow";
import { MoonStarsIcon as MoonStars } from "@phosphor-icons/react/dist/csr/MoonStars";
import { useTranslations } from "next-intl";

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
      <span className="inline-flex items-center whitespace-nowrap text-[11px] tabular-nums text-fg-muted">
        {label}
        <span className="ml-[5px] inline-flex">
          <InfoTooltip text={tooltip} />
        </span>
      </span>
    </div>
  );
}

export function GoogleCapacityNote({ justMissed }: Readonly<{ justMissed: boolean }>) {
  const t = useTranslations("auth.capacity");
  return (
    <p
      className={`mt-1.5 mb-0 px-0.5 text-center text-xs leading-[1.55] ${
        justMissed ? "text-red-text" : "text-fg-muted"
      }`}
    >
      {justMissed
        ? t.rich("googleJustMissed", {
            strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
          })
        : t("googleFull")}
    </p>
  );
}

export function EmailCapacityPanel({
  binding,
  justMissed,
}: Readonly<{ binding: EmailCapacityConstraint; justMissed: boolean }>) {
  const t = useTranslations("auth.capacity");
  const monthly = binding === "monthly";
  return (
    <>
      {justMissed ? (
        <div className="mb-2.5 flex items-start gap-2.5 rounded-control border border-red/25 bg-accent-soft px-3.5 py-3">
          <HourglassLow
            aria-hidden
            className="mt-px shrink-0 text-red-text"
            size={16}
            weight="regular"
          />
          <p className="m-0 text-[12.5px] leading-[1.55] text-red-text">
            {t.rich("wasNotSent", {
              strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
            })}
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-3.5 rounded-card border border-border bg-bg-sunken px-4 py-4.5">
        <div className="flex items-start gap-[11px]">
          <MoonStars
            aria-hidden
            className="mt-px shrink-0 text-yellow-text"
            size={18}
            weight="regular"
          />
          <p className="m-0 text-[13px] leading-[1.6] text-fg-muted">
            <strong className="font-semibold text-fg">
              {monthly ? t("emailFullMonthly") : t("emailFullDaily")}
            </strong>{" "}
            {monthly ? t("emailPanelMonthly") : t("emailPanelDaily")}
          </p>
        </div>
        <a
          className="flex items-center justify-center gap-2 rounded-control border border-border-control bg-bg-elev p-[11px] text-[13.5px] font-semibold text-fg no-underline hover:border-fg-muted"
          href={SELF_HOSTING_URL}
          rel="noreferrer noopener"
          target="_blank"
        >
          <HardDrives aria-hidden size={16} weight="regular" />
          {t("selfHostingGuide")}
        </a>
      </div>
    </>
  );
}

export function FullCapacityCard({
  emailBinding,
}: Readonly<{ emailBinding: EmailCapacityConstraint }>) {
  const t = useTranslations("auth.capacity");
  const monthly = emailBinding === "monthly";
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="grid h-[54px] w-[54px] place-items-center rounded-full bg-accent-soft text-yellow-text">
        <MoonStars aria-hidden size={28} weight="regular" />
      </span>
      <div>
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.7px]">
          {monthly ? t("fullMonthlyTitle") : t("fullDailyTitle")}
        </h1>
        <p className="mt-2.5 mb-0 text-[14px] leading-[1.6] text-fg-muted">
          {monthly ? t("fullMonthlyDescription") : t("fullDailyDescription")}
        </p>
      </div>
      <div className="mt-1 flex w-full flex-col gap-[9px]">
        <a
          className="flex items-center justify-center gap-2 rounded-control bg-accent-solid p-3 text-[14px] font-semibold text-accent-on-solid no-underline hover:bg-accent-solid-hover"
          href={SELF_HOSTING_URL}
          rel="noreferrer noopener"
          target="_blank"
        >
          <HardDrives aria-hidden size={16} weight="regular" />
          {t("selfHost")}
        </a>
        <a
          className="flex items-center justify-center rounded-control border border-border-control bg-transparent p-[11px] text-[13.5px] font-semibold text-fg-muted no-underline hover:bg-bg-sunken"
          href="/login"
        >
          {t("comeBackLater")}
        </a>
      </div>
    </div>
  );
}

// A zero count is worse than no line at all: it advertises a dead sign-up day.
export function JoinedToday({ count }: Readonly<{ count: number }>) {
  const t = useTranslations("auth.capacity");
  if (count <= 0) {
    return null;
  }
  return (
    <p className="mt-3.5 mb-0 text-center text-[11.5px] tabular-nums text-fg-muted">
      {t("joinedToday", { count })}
    </p>
  );
}
