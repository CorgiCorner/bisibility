"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDisplayDate, formatDisplayDateRange } from "@/lib/dates/format";
import type { DataIncident } from "@/lib/search-insights/constants";
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

export function IncidentPill({ incidents }: Readonly<{ incidents: readonly DataIncident[] }>) {
  const t = useTranslations("projectSearchInsights.copy");
  if (incidents.length === 0) return null;
  const tooltip = incidents
    .map((incident) =>
      incident.id === "impressions-2025-05" ? t("incidentImpressions202505") : incident.label,
    )
    .join(" ");
  return (
    <Tooltip content={tooltip}>
      <span className="cursor-help rounded-full bg-bg-inset px-2 py-0.5 font-sans tabular-nums text-ui-micro text-fg-muted">
        {t("incidentPill")}
      </span>
    </Tooltip>
  );
}
