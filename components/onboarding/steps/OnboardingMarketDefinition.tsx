"use client";

import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { NewMarketSheet } from "@/components/markets/sheet/NewMarketSheet";
import { MAX_ONBOARDING_LOCATIONS } from "@/components/onboarding/onboarding-locations";
import { Button } from "@/components/ui/Button";
import type { NewMarketCreateInput, NewMarketCreateResult } from "@/lib/markets/create-input";
import type { SerpDevice } from "@/lib/serp/constants";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useState } from "react";
import type { CreateOnboardingMarketAction } from "./onboarding-market-actions";

type OnboardingMarketDefinitionProps = {
  createMarketAction?: CreateOnboardingMarketAction;
  devices: readonly SerpDevice[];
  error?: string;
  onChange: (locations: LocationFieldValue[]) => void;
  projectId: string;
  values: readonly LocationFieldValue[];
};

const chipClass =
  "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-bg-elev pl-2.5 pr-1.5 text-[12.5px] font-medium text-fg";

function marketValue(result: NewMarketCreateResult): LocationFieldValue {
  return {
    canonicalKey: result.canonicalKey,
    countryCode: result.countryCode,
    displayName: result.displayName,
    kind: result.kind,
    languageCode: result.languageCode,
    languageLabel: result.languageLabel,
  };
}

/** Removing a chip changes the keyword draft; the final step submission reconciles markets. */
export function OnboardingMarketDefinition({
  createMarketAction,
  devices,
  error,
  onChange,
  projectId,
  values,
}: Readonly<OnboardingMarketDefinitionProps>) {
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<ReadonlyMap<string, NewMarketCreateResult>>(new Map());
  const canAddMore = values.length < MAX_ONBOARDING_LOCATIONS;

  async function create(input: NewMarketCreateInput) {
    const known = created.get(input.canonicalKey);
    if (known) return known;
    if (!createMarketAction) throw new Error("Create the project before adding markets.");
    const result = await createMarketAction(input);
    setCreated((current) => new Map(current).set(result.canonicalKey, result));
    return result;
  }

  return (
    <section
      aria-describedby={error ? "onboarding-markets-error" : undefined}
      aria-label="Markets"
      data-analytics-mask
      id="onboarding-markets"
      tabIndex={-1}
    >
      <div className="text-[10px] uppercase tracking-[0.4px] text-fg-muted">Markets</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span className={chipClass} key={value.canonicalKey}>
            <span className="min-w-0 truncate">{value.displayName}</span>
            <span className="text-[11px] text-fg-muted">/</span>
            <span className="text-fg-muted">{value.languageLabel}</span>
            <Button
              aria-label={`Remove ${value.displayName} / ${value.languageLabel}`}
              onClick={() =>
                onChange(values.filter((item) => item.canonicalKey !== value.canonicalKey))
              }
              size="xs"
              style={{
                borderRadius: "9999px",
                height: 20,
                minHeight: 20,
                minWidth: 20,
                padding: 0,
                "--control-hover-color": "var(--red-text)",
                "--control-disabled-background-color": "transparent",
                "--control-disabled-border": "0px",
                "--control-disabled-opacity": 0.4,
              }}
              type="button"
              variant="ghost"
            >
              <X aria-hidden size={11} weight="regular" />
            </Button>
          </span>
        ))}
        {canAddMore ? (
          <Button
            aria-describedby={error ? "onboarding-markets-error" : undefined}
            disabled={!createMarketAction}
            onClick={() => setAdding(true)}
            size="xs"
            startIcon={<Plus aria-hidden size={12} weight="regular" />}
            style={{ borderRadius: "9999px", borderStyle: "dashed", minHeight: 30 }}
            type="button"
            variant="secondary"
          >
            {values.length === 0 ? "Add market" : "Another market"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="m-0 mt-2 text-xs text-red-text" id="onboarding-markets-error">
          {error}
        </p>
      ) : null}
      {!canAddMore ? (
        <p className="m-0 mt-2 text-[11.5px] font-medium text-fg-muted">
          Maximum {MAX_ONBOARDING_LOCATIONS} markets selected.
        </p>
      ) : null}
      <NewMarketSheet
        definitionOnly={{ devices }}
        onClose={() => setAdding(false)}
        onCreate={create}
        onCreated={(result) => onChange([...values, marketValue(result)])}
        open={adding}
        projectId={projectId}
        registry={values.map((value) => ({
          canonicalKey: value.canonicalKey,
          id: value.canonicalKey,
          status: "active" as const,
        }))}
        schedules={[]}
        sources={[]}
      />
    </section>
  );
}
