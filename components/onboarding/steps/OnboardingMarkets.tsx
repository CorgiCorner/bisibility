"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { MarketPicker, type MarketPickerChoice } from "@/components/markets/MarketPicker";
import { languageForLocationValue } from "@/components/onboarding/onboarding-location-field";
import { AppDrawer, Button } from "@/components/ui";
import { MAX_PROJECT_MARKETS } from "@/lib/markets/limits";
import { parseCanonicalKey } from "@/lib/serp/location";
import { PlusIcon as Plus, XIcon as X } from "@phosphor-icons/react";
import { useState } from "react";

export type SaveOnboardingMarketsAction = (input: {
  marketKeys: string[];
  projectId: string;
}) => Promise<{ marketKeys: string[] }>;

type OnboardingMarketsProps = {
  calculatorHref?: string | null;
  error?: string;
  onChange: (locations: LocationFieldValue[]) => void;
  projectId: string;
  values: readonly LocationFieldValue[];
};

function locationValue(choice: MarketPickerChoice): LocationFieldValue {
  const selector = parseCanonicalKey(choice.canonicalKey);
  return {
    canonicalKey: choice.canonicalKey,
    cityName: selector?.cityName ?? null,
    countryCode: choice.countryCode,
    displayName: choice.displayName,
    kind: choice.kind,
    languageCode: choice.language.code,
    languageLabel: choice.language.label,
    regionName: selector?.regionName ?? null,
  };
}

export function OnboardingMarkets({
  calculatorHref,
  error,
  onChange,
  projectId,
  values,
}: Readonly<OnboardingMarketsProps>) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function save(choices: readonly MarketPickerChoice[]) {
    const nextValues = choices.map(locationValue);
    const nextKeys = new Set(nextValues.map((value) => value.canonicalKey));
    onChange([...values.filter((value) => !nextKeys.has(value.canonicalKey)), ...nextValues]);
    setPickerOpen(false);
  }

  function removeMarket(canonicalKey: string) {
    onChange(values.filter((value) => value.canonicalKey !== canonicalKey));
  }

  return (
    <section
      aria-describedby={error ? "onboarding-markets-error" : undefined}
      aria-label="Markets"
      id="onboarding-markets"
      tabIndex={-1}
    >
      <div className="text-[10px] uppercase tracking-[0.4px] text-fg-muted">Markets</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-bg-elev pl-2.5 pr-1.5 text-[12.5px] font-medium text-fg"
            key={value.canonicalKey}
          >
            <span className="min-w-0 truncate">{value.displayName}</span>
            <span className="text-[11px] text-fg-muted">/</span>
            <span className="text-fg-muted">{languageForLocationValue(value)}</span>
            <Button
              aria-label={`Remove ${value.displayName} / ${languageForLocationValue(value)}`}
              onClick={() => removeMarket(value.canonicalKey)}
              size="xs"
              sx={{
                borderRadius: "9999px",
                height: 20,
                minHeight: 20,
                minWidth: 20,
                padding: 0,
                "&:hover": { color: "var(--red-text)" },
                "&.Mui-disabled": { backgroundColor: "transparent", border: 0, opacity: 0.4 },
              }}
              type="button"
              variant="ghost"
            >
              <X aria-hidden size={11} weight="regular" />
            </Button>
          </span>
        ))}
        {values.length < MAX_PROJECT_MARKETS ? (
          <Button
            aria-describedby={error ? "onboarding-markets-error" : undefined}
            onClick={() => setPickerOpen(true)}
            size="xs"
            startIcon={<Plus aria-hidden size={12} weight="regular" />}
            sx={{ borderRadius: "9999px", borderStyle: "dashed", minHeight: 30 }}
            type="button"
            variant="secondary"
          >
            Add market
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="m-0 mt-2 text-[12px] text-red-text" id="onboarding-markets-error">
          {error}
        </p>
      ) : null}
      {values.length >= MAX_PROJECT_MARKETS ? (
        <p className="m-0 mt-2 text-[11.5px] font-medium text-fg-muted">
          Maximum 5 markets selected.
        </p>
      ) : null}
      <AppDrawer
        description="Pick a location, then the languages to track there."
        onClose={() => setPickerOpen(false)}
        open={pickerOpen}
        title="Add market"
      >
        <MarketPicker
          calculatorHref={calculatorHref}
          maxMarkets={MAX_PROJECT_MARKETS}
          onCancel={() => setPickerOpen(false)}
          onCommit={save}
          projectId={projectId}
          trackedCanonicalKeys={values.map((value) => value.canonicalKey)}
        />
      </AppDrawer>
    </section>
  );
}
