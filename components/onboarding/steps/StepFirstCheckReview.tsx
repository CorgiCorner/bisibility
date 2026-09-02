"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { trackingDefaults } from "@/components/onboarding/onboarding-form-utils";
import { languageForLocationValue } from "@/components/onboarding/onboarding-location-field";
import { MenuSelect } from "@/components/ui";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { timezoneSelectOptions } from "@/lib/settings/timezones";
import type { ReactNode } from "react";

type StepFirstCheckReviewProps = {
  devices: readonly unknown[];
  frequency?: ProjectDefaultsInput["frequency"];
  frequencyLabel: string;
  keywordCount: number;
  markets: readonly LocationFieldValue[];
  onTimezoneChange: (value: string) => void;
  providerAction?: ReactNode;
  providerLabel: string;
  providerReady: boolean;
  timezone: string;
};

function SummaryRow({
  children,
  index,
  label,
  subline,
  value,
}: Readonly<{
  children?: ReactNode;
  index: number;
  label: string;
  subline?: string;
  value: string;
}>) {
  return (
    <div
      className={`${index === 0 ? "rounded-t-[11px]" : ""} ${index === 2 ? "rounded-b-[11px]" : ""} ${index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"}`}
      data-summary-row={label.toLowerCase()}
    >
      <div className="flex min-w-0 items-start justify-between gap-4 px-4 py-3">
        <span className="shrink-0 pt-px text-[13px] text-fg-muted">{label}</span>
        <span className="min-w-0 text-right">
          <span
            className="flex min-w-0 items-center justify-end gap-2 text-[13px] font-normal text-fg"
            data-summary-value
          >
            <span aria-label={`${label}: ${value}`} className="min-w-0 truncate whitespace-nowrap">
              {value}
            </span>
            {children}
          </span>
          {subline ? (
            <span className="mt-1 block text-[11.5px] leading-[1.45] text-fg-muted">{subline}</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function trackingSummary(
  keywordCount: number,
  markets: readonly LocationFieldValue[],
  devices: readonly unknown[],
) {
  const keywords = `${keywordCount} ${keywordCount === 1 ? "keyword" : "keywords"}`;
  const marketSummary = markets
    .map((market) => `${market.displayName} (${languageForLocationValue(market)})`)
    .join(" · ");
  const deviceSummary = `${devices.length} ${devices.length === 1 ? "device" : "devices"}`;
  return [keywords, trackingDefaults.engine, marketSummary, deviceSummary]
    .filter(Boolean)
    .join(" · ");
}

function scheduleSummary(frequency: ProjectDefaultsInput["frequency"] | undefined) {
  if (frequency === "manual") return "Manual - checks run when you start them";
  if (frequency === "paused") return "Paused - no checks are scheduled";
  return null;
}

export function StepFirstCheckReview({
  devices,
  frequency,
  frequencyLabel,
  keywordCount,
  markets,
  onTimezoneChange,
  providerAction,
  providerLabel,
  providerReady,
  timezone,
}: Readonly<StepFirstCheckReviewProps>) {
  const manualSchedule = scheduleSummary(frequency);
  const scheduledValue = frequencyLabel;

  return (
    <div className="mt-5 rounded-card border border-border">
      <SummaryRow
        index={0}
        label="Tracking"
        value={trackingSummary(keywordCount, markets, devices)}
      />
      {manualSchedule ? (
        <SummaryRow index={1} label="Schedule" value={manualSchedule} />
      ) : (
        <SummaryRow index={1} label="Schedule" value={`${scheduledValue} · ${timezone}`}>
          <span aria-hidden className="text-border-strong">
            ·
          </span>
          <MenuSelect
            ariaLabel="Project timezone"
            onChange={onTimezoneChange}
            options={timezoneSelectOptions(timezone)}
            searchable
            searchPlaceholder="City or region"
            triggerClassName="min-h-0 min-w-0 border-0 bg-transparent px-0 text-xs text-fg-muted hover:border-0 focus-visible:border-0"
            value={timezone}
          />
        </SummaryRow>
      )}
      <SummaryRow
        index={2}
        label="Data source"
        subline={providerReady ? undefined : "Checks start once a provider is connected."}
        value={providerLabel}
      >
        {providerAction}
      </SummaryRow>
    </div>
  );
}
