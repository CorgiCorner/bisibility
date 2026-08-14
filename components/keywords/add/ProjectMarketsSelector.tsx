"use client";

import { MarketPicker, type MarketPickerChoice } from "@/components/markets/MarketPicker";
import { Button, MonoText } from "@/components/ui";
import { addProjectMarkets, type ProjectMarketChoice } from "@/lib/actions/project-markets";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { type SerpDevice, serpDeviceOptions } from "@/lib/serp/markets";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { CheckIcon as Check, PlusIcon as Plus } from "@phosphor-icons/react";
import { useState } from "react";

type ProjectMarketsSelectorProps = {
  description?: string;
  defaultDevice: SerpDevice;
  initialDevices?: readonly SerpDevice[];
  initialMarketKeys: readonly string[];
  markets: ProjectMarketsView;
  onChange: (value: { devices: SerpDevice[]; locationKeys: string[] }) => void;
  projectId: string;
};

function marketChoice(choice: MarketPickerChoice): ProjectMarketChoice {
  return {
    canonicalKey: choice.canonicalKey,
    countryCode: choice.countryCode,
    kind: choice.kind,
    languageCode: choice.language.code,
  };
}

function label(market: ProjectMarketsView["markets"][number]) {
  return `${market.displayName} / ${market.languageLabel}`;
}

export function ProjectMarketsSelector({
  description,
  defaultDevice,
  initialDevices,
  initialMarketKeys,
  markets: initialMarkets,
  onChange,
  projectId,
}: Readonly<ProjectMarketsSelectorProps>) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => [...initialMarketKeys]);
  const [devices, setDevices] = useState<SerpDevice[]>(() =>
    initialDevices?.length ? [...new Set(initialDevices)] : [defaultDevice],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(nextKeys: string[], nextDevices = devices) {
    setSelectedKeys(nextKeys);
    setDevices(nextDevices);
    onChange({ devices: nextDevices, locationKeys: nextKeys });
  }

  function toggleMarket(key: string) {
    update(
      selectedKeys.includes(key)
        ? selectedKeys.filter((item) => item !== key)
        : [...selectedKeys, key],
    );
  }

  function toggleDevice(device: SerpDevice) {
    const next = devices.includes(device)
      ? devices.filter((item) => item !== device)
      : [...devices, device];
    if (next.length > 0) update(selectedKeys, next);
  }

  async function addMarkets(choices: readonly MarketPickerChoice[]) {
    setError(null);
    try {
      const result = await addProjectMarkets({ choices: choices.map(marketChoice), projectId });
      if (!result.ok) {
        setError(`This project can track up to ${result.maxMarkets} markets.`);
        return;
      }
      const added = choices.map((choice) => ({
        canonicalKey: choice.canonicalKey,
        countryCode: choice.countryCode,
        displayName: choice.displayName,
        id: choice.canonicalKey,
        languageLabel: choice.language.label,
        languageCode: choice.language.code,
        monthlyCostCents: null,
        researchAvailable: choice.researchAvailable,
        status: "active" as const,
      }));
      setMarkets((current) => ({ ...current, markets: [...current.markets, ...added] }));
      update([...selectedKeys, ...added.map((choice) => choice.canonicalKey)]);
      setPickerOpen(false);
    } catch (cause) {
      setError(actionErrorMessage(cause, "Markets could not be added."));
    }
  }

  const visibleMarkets = markets.markets;
  return (
    <section aria-label="Markets" className="grid gap-3">
      <div>
        <MonoText component="p" muted size="md">
          MARKETS
        </MonoText>
        {description ? <p className="m-0 mt-1 text-[11.5px] text-fg-muted">{description}</p> : null}
      </div>
      {visibleMarkets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibleMarkets.map((market) => {
            const active = market.status === "active";
            const selected = selectedKeys.includes(market.canonicalKey);
            return (
              <button
                aria-label={label(market)}
                aria-pressed={selected}
                className={`inline-flex min-h-[30px] max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-medium outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid ${
                  selected
                    ? "bg-accent-soft text-fg"
                    : "bg-bg-elev text-fg-muted hover:bg-bg-sunken"
                } ${active ? "" : "opacity-60"}`}
                disabled={!active}
                key={market.id}
                onClick={() => toggleMarket(market.canonicalKey)}
                type="button"
              >
                {selected ? <Check aria-hidden size={10} weight="bold" /> : null}
                <span className="inline-flex min-w-0 items-baseline gap-1 whitespace-nowrap">
                  <span className="truncate font-semibold">{market.displayName}</span>
                  <span className="text-fg-muted">/ {market.languageLabel}</span>
                </span>
                {!market.researchAvailable ? (
                  <MonoText component="span" muted size="md">
                    no volume/KD
                  </MonoText>
                ) : null}
                {!active ? (
                  <MonoText component="span" muted size="sm">
                    PAUSED
                  </MonoText>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="m-0 text-[12px] text-fg-muted">
          No enabled markets. Enable or add one in Settings &gt; Markets.
        </p>
      )}
      <Button
        disabled={visibleMarkets.length >= markets.maxMarkets}
        onClick={() => setPickerOpen(true)}
        size="xs"
        startIcon={<Plus aria-hidden size={11} weight="bold" />}
        sx={{
          alignSelf: "start",
          backgroundColor: "transparent",
          border: 0,
          color: "var(--fg-muted)",
          justifySelf: "start",
          minHeight: 34,
          padding: 0,
          "&:hover": {
            backgroundColor: "transparent",
            border: 0,
            color: "var(--accent-text)",
          },
          "&.Mui-disabled": {
            backgroundColor: "transparent",
            border: 0,
            color: "var(--fg-muted)",
            opacity: 0.55,
          },
        }}
        type="button"
        variant="ghost"
      >
        New market
      </Button>
      {pickerOpen ? (
        <MarketPicker
          maxMarkets={markets.maxMarkets}
          onCancel={() => setPickerOpen(false)}
          onCommit={addMarkets}
          projectId={projectId}
          trackedCanonicalKeys={visibleMarkets.map((market) => market.canonicalKey)}
        />
      ) : null}
      <div>
        <MonoText component="p" muted size="md">
          DEVICES
        </MonoText>
        <div className="mt-2 flex gap-2">
          {serpDeviceOptions.map((option) => (
            <button
              aria-pressed={devices.includes(option.value)}
              className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid ${devices.includes(option.value) ? "bg-accent-soft text-fg" : "bg-bg-elev text-fg-muted hover:bg-bg-sunken"}`}
              key={option.value}
              onClick={() => toggleDevice(option.value)}
              type="button"
            >
              {devices.includes(option.value) ? (
                <Check aria-hidden size={10} weight="bold" />
              ) : null}
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="m-0 text-[12px] text-red-text">{error}</p> : null}
    </section>
  );
}
