"use client";

import { RateSourceChip } from "@/components/integrations/RateSourceChip";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { centsToDollars } from "@/lib/format/currency";
import type { ProviderActionHandlers, ProviderRateData } from "@/lib/integrations/types";
import type { ProviderRateFeature } from "@/lib/provider-rates/resolver";
import { PROVIDER_RATE_COST_BOUNDS } from "@/lib/schemas/provider";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ProviderRatesProps = {
  connected: boolean;
  projectId: string;
  providerId: string;
  rates: readonly ProviderRateData[];
  updateRate?: NonNullable<ProviderActionHandlers["updateProviderRate"]>;
};

type UpdateRateInput = Parameters<NonNullable<ProviderActionHandlers["updateProviderRate"]>>[0];

function displayedAmount(rate: ProviderRateData, t: ReturnType<typeof useTranslations>) {
  return rate.amountCents === undefined
    ? t("notSet")
    : `$${centsToDollars(rate.amountCents).toFixed(4)}`;
}

function fallbackLabel(rate: ProviderRateData, t: ReturnType<typeof useTranslations>) {
  if (rate.fallbackSource === "measured") return t("useMeasured");
  if (rate.fallbackSource === "list") return t("useList");
  return null;
}

export function ProviderRates({
  connected,
  projectId,
  providerId,
  rates,
  updateRate,
}: Readonly<ProviderRatesProps>) {
  const t = useTranslations("projectIntegrations.rates");
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const [editing, setEditing] = useState<ProviderRateFeature | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rates.length === 0) return null;

  function edit(rate: ProviderRateData) {
    if (rate.editable === false) return;
    if (!connected || readOnly || pending) return;
    if (editing === rate.feature) {
      setEditing(null);
      setDraft("");
      setError(null);
      return;
    }
    setEditing(rate.feature);
    setDraft(rate.amountCents === undefined ? "" : centsToDollars(rate.amountCents).toFixed(4));
    setError(null);
  }

  async function save(rate: ProviderRateData, costPerUnit: number | null) {
    if (rate.editable === false) return;
    if (!updateRate || readOnly) return;
    setPending(true);
    setError(null);
    try {
      await updateRate({
        costPerUnit,
        feature: rate.feature,
        projectId,
        providerId: providerId as UpdateRateInput["providerId"],
      });
      setEditing(null);
      setDraft("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("saveError"));
    } finally {
      setPending(false);
    }
  }

  function saveDraft(rate: ProviderRateData) {
    if (rate.editable === false) return;
    const normalized = draft.trim().replace(",", ".");
    const value = Number(normalized);
    const { maximum, minimum } = PROVIDER_RATE_COST_BOUNDS;
    if (!normalized || !Number.isFinite(value) || value < minimum || value > maximum) {
      setError(t("invalidRate", { maximum, minimum }));
      return;
    }
    void save(rate, value);
  }

  return (
    <section className="overflow-hidden rounded-control border border-border">
      <div className="bg-bg-sunken py-2 pr-2.5 pl-3.5 text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {t("title")}
      </div>
      {rates.map((rate) => {
        const clearLabel = rate.source === "manual" ? fallbackLabel(rate, t) : null;
        const isEditing = editing === rate.feature;
        return (
          <div className="border-border border-t" key={rate.feature}>
            <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <span className="pt-1 text-[13px] font-medium">{rate.label}</span>
              {rate.editable === false ? (
                <span className="inline-flex items-center gap-[9px] px-2 py-1">
                  <span className="text-xs font-medium tabular-nums text-fg">
                    {displayedAmount(rate, t)}
                  </span>
                  <RateSourceChip {...rate} />
                </span>
              ) : (
                <button
                  aria-label={t("editRate", { label: rate.label })}
                  className={`inline-flex items-center gap-[9px] rounded-control border px-2 py-1 outline-none transition-colors hover:border-border-control hover:bg-bg-sunken focus-visible:border-accent disabled:cursor-default disabled:opacity-70 ${
                    rate.source === "manual" || isEditing
                      ? "border-accent bg-accent-soft"
                      : "border-transparent bg-transparent"
                  }`}
                  disabled={!connected || readOnly || pending}
                  onClick={() => edit(rate)}
                  type="button"
                >
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      rate.amountCents === undefined ? "text-fg-muted" : "text-fg"
                    }`}
                  >
                    {displayedAmount(rate, t)}
                  </span>
                  <RateSourceChip {...rate} />
                </button>
              )}
            </div>
            {isEditing ? (
              <div className="flex items-center gap-[9px] px-3.5 pb-3">
                <input
                  aria-label={t("rateUsd", { label: rate.label })}
                  className="min-w-0 flex-1 rounded-control border border-accent bg-transparent px-3 py-[9px] text-[13px] font-medium tabular-nums text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
                  disabled={pending}
                  inputMode="decimal"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveDraft(rate);
                    if (event.key === "Escape") {
                      setEditing(null);
                      setDraft("");
                      setError(null);
                    }
                  }}
                  placeholder="0.0000"
                  value={draft}
                />
                <Button
                  disabled={pending}
                  onClick={() => saveDraft(rate)}
                  type="button"
                  variant="primary"
                >
                  {t("save")}
                </Button>
                {clearLabel ? (
                  <Button
                    disabled={pending}
                    onClick={() => void save(rate, null)}
                    style={{ "--control-color": "var(--fg-muted)" }}
                    type="button"
                    variant="secondary"
                  >
                    {clearLabel}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p
          className="m-0 border-border border-t px-3.5 py-2 text-[10px] text-red-text"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <p className="m-0 border-border border-t bg-bg-sunken px-3.5 py-[11px] text-[10px] leading-[1.6] text-fg-muted">
        {t("help")}
      </p>
    </section>
  );
}
