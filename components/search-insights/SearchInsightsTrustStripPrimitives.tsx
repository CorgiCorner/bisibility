"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDisplayDate, formatDisplayDateRange } from "@/lib/dates/format";
import type { DataIncident } from "@/lib/search-insights/constants";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const CELL = "flex flex-col gap-1.5 px-4 py-3";
const LABEL = "font-sans tabular-nums text-ui-micro uppercase tracking-wide text-fg-muted";

export function TrustStripCell({
  children,
  divided,
  label,
  trailing,
}: Readonly<{ children: ReactNode; divided?: boolean; label: string; trailing?: ReactNode }>) {
  return (
    <div className={divided ? `${CELL} border-t border-border xl:border-l xl:border-t-0` : CELL}>
      <span className="flex items-center gap-2">
        <span className={LABEL}>{label}</span>
        {trailing}
      </span>
      {children}
    </div>
  );
}

export function EmphasizedDate({
  compact = false,
  value,
}: Readonly<{ compact?: boolean; value: string }>) {
  const dateDisplay = useDateDisplay();
  const label = compact
    ? formatDisplayDateRange(value, value, dateDisplay)
    : formatDisplayDate(value, dateDisplay);
  return (
    <strong className="font-semibold" data-testid="provider-available-date">
      <span className="font-sans tabular-nums">{label}</span>
    </strong>
  );
}

/** A quiet note, not an alarm: the anomaly qualifies the freshness fact beside it. */
export function IncidentPill({ incidents }: Readonly<{ incidents: readonly DataIncident[] }>) {
  const t = useTranslations("projectSearchInsights.copy");
  const dateDisplay = useDateDisplay();
  if (incidents.length === 0) return null;
  const details = incidents.map((incident) => {
    const from = formatDisplayDate(incident.from, dateDisplay);
    const to = formatDisplayDate(incident.to, dateDisplay);
    return incident.id === "impressions-2025-05"
      ? t("incidentImpressions202505", { from, to })
      : incident.label;
  });
  return (
    <Tooltip
      content={
        <span className="flex max-w-[280px] flex-col gap-1">
          <span className="font-semibold">{t("incidentTitle")}</span>
          {details.map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
        </span>
      }
      semantics="description"
    >
      <button
        className="inline-flex cursor-help items-center gap-1 appearance-none border-0 bg-transparent p-0 font-sans text-ui-micro text-fg-muted underline decoration-dotted underline-offset-[3px] transition-colors hover:text-fg focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
        type="button"
      >
        <Info aria-hidden size={12} weight="regular" />
        {t("incidentPill")}
      </button>
    </Tooltip>
  );
}
