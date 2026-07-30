"use client";

import { RateSourceChip } from "@/components/integrations/RateSourceChip";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { centsToDollars } from "@/lib/format/currency";
import type { ProviderActionHandlers, ProviderRateData } from "@/lib/integrations/types";
import { PROVIDER_RATE_COST_BOUNDS } from "@/lib/schemas/provider";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ProviderRatesProps = {
  connected: boolean;
  projectId: string;
  providerId: string;
  rates: readonly ProviderRateData[];
  updateRate?: NonNullable<ProviderActionHandlers["updateProviderRate"]>;
};

type UpdateRateInput = Parameters<NonNullable<ProviderActionHandlers["updateProviderRate"]>>[0];

function displayedAmount(rate: ProviderRateData) {
  return rate.amountCents === undefined
    ? "Not set"
    : `$${centsToDollars(rate.amountCents).toFixed(4)}`;
}

function fallbackLabel(rate: ProviderRateData) {
  if (rate.fallbackSource === "measured") return "Use measured rate";
  if (rate.fallbackSource === "list") return "Use list price";
  return null;
}

export function ProviderRates({
  connected,
  projectId,
  providerId,
  rates,
  updateRate,
}: Readonly<ProviderRatesProps>) {
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const [editing, setEditing] = useState<ProviderRateData["feature"] | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rates.length === 0) return null;

  function edit(rate: ProviderRateData) {
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
      setError(cause instanceof Error ? cause.message : "Rate could not be saved.");
    } finally {
      setPending(false);
    }
  }

  function saveDraft(rate: ProviderRateData) {
    const normalized = draft.trim().replace(",", ".");
    const value = Number(normalized);
    const { maximum, minimum } = PROVIDER_RATE_COST_BOUNDS;
    if (!normalized || !Number.isFinite(value) || value < minimum || value > maximum) {
      setError(`Enter a rate from ${minimum} to ${maximum}.`);
      return;
    }
    void save(rate, value);
  }

  return (
    <section className="overflow-hidden rounded-[11px] border border-border">
      <div className="bg-bg-sunken py-2 pr-2.5 pl-3.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
        Provider rates
      </div>
      {rates.map((rate) => {
        const clearLabel = rate.source === "manual" ? fallbackLabel(rate) : null;
        const isEditing = editing === rate.feature;
        return (
          <div className="border-border-soft border-t" key={rate.feature}>
            <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <span className="pt-1 text-[13px] font-medium">{rate.label}</span>
              <button
                aria-label={`Edit ${rate.label} rate`}
                className={`inline-flex items-center gap-[9px] rounded-[7px] border px-2 py-1 outline-none transition-colors hover:border-border-strong hover:bg-bg-sunken focus-visible:border-accent disabled:cursor-default disabled:opacity-70 ${
                  rate.source === "manual" || isEditing
                    ? "border-accent bg-accent-soft"
                    : "border-transparent bg-transparent"
                }`}
                disabled={!connected || readOnly || pending}
                onClick={() => edit(rate)}
                type="button"
              >
                <span
                  className={`font-mono text-xs font-medium ${
                    rate.amountCents === undefined ? "text-fg-faint" : "text-fg"
                  }`}
                >
                  {displayedAmount(rate)}
                </span>
                <RateSourceChip {...rate} />
              </button>
            </div>
            {isEditing ? (
              <div className="flex items-center gap-[9px] px-3.5 pb-3">
                <input
                  aria-label={`${rate.label} rate in USD`}
                  className="min-w-0 flex-1 rounded-lg border border-accent bg-bg-elev px-3 py-[9px] font-mono text-[13px] font-medium text-fg outline-none"
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
                <button
                  className="rounded-lg bg-accent px-[13px] py-[9px] text-xs font-semibold text-white disabled:opacity-60"
                  disabled={pending}
                  onClick={() => saveDraft(rate)}
                  type="button"
                >
                  Save
                </button>
                {clearLabel ? (
                  <button
                    className="rounded-lg border border-border-strong bg-bg-elev px-[13px] py-[9px] text-xs font-semibold text-fg-muted disabled:opacity-60"
                    disabled={pending}
                    onClick={() => void save(rate, null)}
                    type="button"
                  >
                    {clearLabel}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p
          className="m-0 border-border-soft border-t px-3.5 py-2 font-mono text-[10px] text-red"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <p className="m-0 border-border-soft border-t bg-bg-sunken px-3.5 py-[11px] font-mono text-[10px] leading-[1.6] text-fg-faint">
        Set a rate to override any of these. Providers bill you directly.
      </p>
    </section>
  );
}
