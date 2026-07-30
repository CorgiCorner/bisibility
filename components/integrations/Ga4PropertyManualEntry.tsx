"use client";

import { Button } from "@/components/ui";
import { normalizeGa4PropertyId } from "@/lib/providers/analytics/property-id";

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

const labelClass =
  "flex flex-col gap-[7px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";

const inputClass =
  "rounded-[9px] border border-border-strong bg-bg-sunken px-[13px] py-[11px] font-mono text-[13px] font-medium text-fg outline-none placeholder:text-fg-faint focus-visible:border-accent";

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
  const normalized = property.trim() ? normalizeGa4PropertyId(property) : null;

  if (!manualEntry) {
    return hasOptions ? (
      <Button
        onClick={() => {
          onManualEntryChange(true);
          onPropertyChange("");
          onErrorChange(null);
        }}
        type="button"
        variant="secondary"
      >
        I don&apos;t see my property
      </Button>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-3">
      <label className={labelClass}>
        GA4 property id
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
          placeholder="123456789"
          required
          type="text"
          value={property}
        />
      </label>
      <p className="m-0 text-[11.5px] leading-5 text-fg-muted">
        In GA4, open Admin (gear, bottom-left) → Property settings → Property details and copy the
        digits-only Property ID. You can also search for “Property ID” in Analytics. Do not paste a
        G- Measurement ID or UA- tracking ID. See Google&apos;s{" "}
        <a
          className="text-accent underline"
          href="https://developers.google.com/analytics/devguides/reporting/data/v1/property-id"
          rel="noreferrer"
          target="_blank"
        >
          Property ID guide
        </a>{" "}
        and{" "}
        <a
          className="text-accent underline"
          href="https://support.google.com/analytics/answer/12270356?hl=en"
          rel="noreferrer"
          target="_blank"
        >
          Measurement ID guide
        </a>
        .
      </p>
      {propertyError ? (
        <p className="m-0 text-[12.5px] leading-5 text-red" role="alert">
          {propertyError}
        </p>
      ) : null}
      <Button
        disabled={!normalized?.ok || Boolean(propertyError) || readOnly}
        loading={pending}
        loadingLabel="Connecting…"
        onClick={onSelect}
        type="button"
      >
        Use entered property
      </Button>
    </div>
  );
}
