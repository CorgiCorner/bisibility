"use client";

import { Button } from "@/components/ui/Button";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { inputClassName } from "@/components/ui/input-styles";
import { normalizeGa4PropertyId } from "@/lib/providers/analytics/property-id";
import { useTranslations } from "next-intl";

type Ga4PropertyManualEntryProps = {
  hasOptions: boolean;
  manualEntry: boolean;
  onErrorChange: (error: string | null) => void;
  onManualEntryChange: (manualEntry: boolean) => void;
  onPropertyChange: (property: string) => void;
  onSelect: () => void;
  pending: boolean;
  property: string;
  propertyError: string | null;
  readOnly: boolean;
};

const labelClass = "flex flex-col gap-[7px] text-[10px] uppercase tracking-[0.5px] text-fg-muted";

const inputClass = `${inputClassName} rounded-control px-[13px] py-[11px] text-[13px] font-medium`;

export function Ga4PropertyManualEntry({
  hasOptions,
  manualEntry,
  onErrorChange,
  onManualEntryChange,
  onPropertyChange,
  onSelect,
  pending,
  property,
  propertyError,
  readOnly,
}: Readonly<Ga4PropertyManualEntryProps>) {
  const t = useTranslations("projectIntegrations.oauth");
  const normalized = property.trim() ? normalizeGa4PropertyId(property) : null;

  if (!manualEntry) {
    return hasOptions ? (
      <Button
        onClick={() => {
          onManualEntryChange(true);
          onPropertyChange("");
          onErrorChange(null);
        }}
        className="w-auto self-start"
        type="button"
        variant="ghost"
      >
        {t("manualEntry")}
      </Button>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-3">
      <label className={labelClass}>
        {t("ga4PropertyId")}
        <input
          autoComplete="off"
          aria-invalid={Boolean(propertyError)}
          className={inputClass}
          onBlur={() => {
            const result = normalizeGa4PropertyId(property);
            onErrorChange(result.ok ? null : result.error.message);
          }}
          onChange={(event) => {
            onPropertyChange(event.target.value);
            onErrorChange(null);
          }}
          required
          type="text"
          value={property}
        />
      </label>
      <p className="m-0 text-[11.5px] leading-5 text-fg-muted">
        {t.rich("ga4PropertyHelp", {
          measurementGuide: (chunks) => (
            <ExternalLink
              className="text-accent-text hover:underline"
              href="https://support.google.com/analytics/answer/12270356?hl=en"
            >
              {chunks}
            </ExternalLink>
          ),
          propertyGuide: (chunks) => (
            <ExternalLink
              className="text-accent-text hover:underline"
              href="https://developers.google.com/analytics/devguides/reporting/data/v1/property-id"
            >
              {chunks}
            </ExternalLink>
          ),
        })}
      </p>
      {propertyError ? (
        <p className="m-0 text-[12.5px] leading-5 text-red-text" role="alert">
          {propertyError}
        </p>
      ) : null}
      <Button
        disabled={!normalized?.ok || Boolean(propertyError) || readOnly}
        loading={pending}
        loadingLabel={t("connecting")}
        onClick={onSelect}
        type="button"
      >
        {t("useEnteredProperty")}
      </Button>
    </div>
  );
}
