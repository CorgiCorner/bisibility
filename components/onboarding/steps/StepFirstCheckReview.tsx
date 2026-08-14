"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { trackingDefaults } from "@/components/onboarding/onboarding-form-utils";
import { languageForLocationValue } from "@/components/onboarding/onboarding-location-field";
import { MenuSelect } from "@/components/ui";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { timezoneSelectOptions } from "@/lib/settings/timezones";
import type { ReactNode } from "react";
import type { FirstCheckRunState } from "./use-first-check-run";

type KeywordOption = { label: string; value: string };

type StepFirstCheckReviewProps = {
  devices: readonly unknown[];
  firstCheckLabel: string;
  frequency?: ProjectDefaultsInput["frequency"];
  frequencyLabel: string;
  keywordCount: number;
  keywordOptions: readonly KeywordOption[];
  markets: readonly LocationFieldValue[];
  onSampleKeywordChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  paused: boolean;
  projectLabel: string;
  providerLabel: string;
  providerReady: boolean;
  sampleKeyword: string;
  stateStatus: FirstCheckRunState["status"];
  timezone: string;
};

function nextRunLabel(frequency: ProjectDefaultsInput["frequency"] | undefined) {
  if (frequency === "weekly") return "Weekly schedule";
  if (frequency === "monthly") return "Monthly schedule";
  if (frequency === "custom_cron") return "Custom schedule";
  return "Daily schedule";
}

function MarketChip({ value }: Readonly<{ value: LocationFieldValue }>) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-bg-elev px-2.5 text-[11.5px] text-fg">
      {value.displayName}
      <span className="font-mono text-[10px] text-fg-muted">/</span>
      <span className="text-fg-muted">{languageForLocationValue(value)}</span>
    </span>
  );
}

function SummaryRow({
  children,
  index,
  label,
  value,
}: Readonly<{
  children?: ReactNode;
  index: number;
  label: string;
  value: string;
}>) {
  return (
    <div
      className={`${index === 0 ? "rounded-t-[11px]" : ""} ${index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"}`}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="shrink-0 text-[13px] text-fg-muted">{label}</span>
        <span className="min-w-0 text-right font-mono text-[13px] font-semibold text-fg">
          {value}
        </span>
      </div>
      {children}
    </div>
  );
}

export function StepFirstCheckReview({
  devices,
  firstCheckLabel,
  frequency,
  frequencyLabel,
  keywordCount,
  keywordOptions,
  markets,
  onSampleKeywordChange,
  onTimezoneChange,
  paused,
  projectLabel,
  providerLabel,
  providerReady,
  sampleKeyword,
  stateStatus,
  timezone,
}: Readonly<StepFirstCheckReviewProps>) {
  const marketLabel = markets.length === 1 ? "market" : "markets";
  const deviceLabel = devices.length === 1 ? "device" : "devices";
  const selectedKeyword = keywordOptions.find((option) => option.value === sampleKeyword)?.label;

  return (
    <div className="mt-5 rounded-xl border border-border">
      <SummaryRow index={0} label="Project" value={projectLabel} />
      <SummaryRow index={1} label="Provider" value={providerLabel} />
      <SummaryRow index={2} label="Keywords" value={String(keywordCount)} />
      <SummaryRow
        index={3}
        label="Scope"
        value={`${trackingDefaults.engine} / ${markets.length} ${marketLabel} / ${devices.length} ${deviceLabel} / ${frequencyLabel}`}
      >
        <div className="flex items-center justify-between gap-4 px-4 pb-[13px]">
          <span className="shrink-0 text-[13px] text-fg-muted">Markets</span>
          <div className="flex flex-wrap justify-end gap-1.5">
            {markets.map((market) => (
              <MarketChip key={market.canonicalKey} value={market} />
            ))}
          </div>
        </div>
      </SummaryRow>
      <SummaryRow index={4} label="First check" value={firstCheckLabel} />
      <div className="bg-bg-elev">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="shrink-0 text-[13px] text-fg-muted">Sample keyword</span>
          {providerReady && keywordOptions.length > 1 && stateStatus === "idle" ? (
            <MenuSelect
              ariaLabel="Keyword used for the sample checks"
              onChange={onSampleKeywordChange}
              options={keywordOptions}
              triggerClassName="min-h-[34px] w-[260px] max-w-full justify-between rounded-lg bg-bg-elev px-2.5 text-[12.5px] font-medium"
              value={sampleKeyword}
            />
          ) : (
            <span className="min-w-0 text-right font-mono text-[13px] font-semibold text-fg">
              {providerReady
                ? (selectedKeyword ?? "No keywords")
                : "Paused until a provider is connected"}
            </span>
          )}
        </div>
      </div>
      <div className="rounded-b-[11px] bg-bg-sunken">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="shrink-0 text-[13px] text-fg-muted">Next scheduled run</span>
          {providerReady && !paused ? (
            <span className="flex min-w-0 items-center justify-end gap-2">
              <span className="shrink-0 font-mono text-[13px] font-semibold text-fg">
                {nextRunLabel(frequency)}
              </span>
              <span aria-hidden className="text-border-strong">
                /
              </span>
              <MenuSelect
                ariaLabel="Project timezone"
                onChange={onTimezoneChange}
                options={timezoneSelectOptions(timezone)}
                searchable
                searchPlaceholder="City or region"
                triggerClassName="min-h-0 min-w-0 border-0 bg-transparent px-0 font-mono text-xs text-fg-muted hover:border-0 focus-visible:border-0"
                value={timezone}
              />
            </span>
          ) : (
            <span className="text-right font-mono text-[13px] font-semibold text-fg">
              {providerReady ? frequencyLabel : "Paused until a provider is connected"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
