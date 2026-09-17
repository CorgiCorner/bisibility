"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { presentSafeActionError } from "@/components/keywords/safe-action-error";
import { MarketPicker, type MarketPickerChoice } from "@/components/markets/MarketPicker";
import { Button } from "@/components/ui/Button";
import { addProjectMarkets, type ProjectMarketChoice } from "@/lib/actions/project-markets";
import { languageDisplayName, regionDisplayName } from "@/lib/i18n/display-names";
import { fieldLabelClass, fieldMetaClass } from "@/lib/keywords/add-keyword-drawer-shared";
import { MarketArchivedError } from "@/lib/markets/archived";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { type SerpDevice, serpDeviceValues } from "@/lib/serp/constants";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useLocale, useTranslations } from "next-intl";
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

type MarketNames = { language: string; location: string };

/** The stored labels are English; the viewer's locale owns the words that are shown. */
function marketNames(market: ProjectMarketsView["markets"][number], locale: string): MarketNames {
  return {
    language: languageDisplayName(market.languageCode, market.languageLabel, locale),
    location: regionDisplayName(market.countryCode, market.displayName, locale),
  };
}

function label(names: MarketNames) {
  return `${names.location} / ${names.language}`;
}

function SectionLabel({
  children,
  requiredLabel,
}: Readonly<{ children: string; requiredLabel: string }>) {
  return (
    <div className="flex items-center gap-2">
      <span className={fieldLabelClass}>{children}</span>
      <span className={fieldMetaClass}>{requiredLabel}</span>
    </div>
  );
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
  const t = useTranslations("projectRankTracker.keywordImport.management.add");
  const deviceNames = useTranslations("shared.markets");
  const locale = useLocale();
  const sharedErrors = useSharedErrorMessages();
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
        setError(t("marketLimit", { count: result.maxMarkets }));
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
      if (cause instanceof MarketArchivedError) {
        setError(t("marketArchived", { market: cause.marketName }));
        return;
      }
      setError(presentSafeActionError(cause, sharedErrors, t("marketsAddFailed")));
    }
  }

  const visibleMarkets = markets.markets;
  return (
    <section aria-label={t("markets")} className="grid gap-3">
      <div>
        <SectionLabel requiredLabel={t("required")}>{t("markets")}</SectionLabel>
        {description ? <p className="m-0 mt-1 text-[11.5px] text-fg-muted">{description}</p> : null}
      </div>
      {visibleMarkets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibleMarkets.map((market) => {
            const active = market.status === "active";
            const selected = selectedKeys.includes(market.canonicalKey);
            const names = marketNames(market, locale);
            return (
              <button
                aria-label={label(names)}
                aria-pressed={selected}
                className={`inline-flex min-h-[30px] max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-medium outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid ${
                  selected ? "bg-bg-sunken text-fg" : "bg-bg-elev text-fg-muted hover:bg-bg-sunken"
                } ${active ? "" : "opacity-60"}`}
                key={market.id}
                onClick={() => toggleMarket(market.canonicalKey)}
                type="button"
              >
                {selected ? <Check aria-hidden size={10} weight="regular" /> : null}
                <span className="inline-flex min-w-0 items-baseline gap-1 whitespace-nowrap">
                  <span className="truncate font-semibold">{names.location}</span>
                  <span className="text-fg-muted">/ {names.language}</span>
                </span>
                {!market.researchAvailable ? (
                  <span className="font-sans text-[10px] tabular-nums" style={{ fontSize: "10px" }}>
                    {t("marketUnavailableResearch")}
                  </span>
                ) : null}
                {!active ? (
                  <span className="font-sans text-[9px] tabular-nums" style={{ fontSize: "9px" }}>
                    {t("marketPaused")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="m-0 text-[12px] text-fg-muted">{t("noMarkets")}</p>
      )}
      <Button
        disabled={visibleMarkets.length >= markets.maxMarkets}
        onClick={() => setPickerOpen(true)}
        size="xs"
        startIcon={<Plus aria-hidden size={11} weight="regular" />}
        style={{
          alignSelf: "start",
          "--control-background-color": "transparent",
          "--control-border": "0px",
          "--control-color": "var(--fg-muted)",
          justifySelf: "start",
          minHeight: 34,
          padding: 0,
          "--control-hover-background-color": "transparent",
          "--control-hover-border": "0px",
          "--control-hover-color": "var(--accent-text)",
          "--control-disabled-background-color": "transparent",
          "--control-disabled-border": "0px",
          "--control-disabled-color": "var(--fg-muted)",
          "--control-disabled-opacity": 0.55,
        }}
        type="button"
        variant="ghost"
      >
        {t("newMarket")}
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
        <SectionLabel requiredLabel={t("required")}>{t("devices")}</SectionLabel>
        <div className="mt-2 flex gap-2">
          {serpDeviceValues.map((device) => (
            <button
              aria-pressed={devices.includes(device)}
              className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid ${devices.includes(device) ? "bg-bg-sunken text-fg" : "bg-bg-elev text-fg-muted hover:bg-bg-sunken"}`}
              key={device}
              onClick={() => toggleDevice(device)}
              type="button"
            >
              {devices.includes(device) ? <Check aria-hidden size={10} weight="regular" /> : null}
              {deviceNames(device)}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="m-0 text-[12px] text-red-text">{error}</p> : null}
    </section>
  );
}
