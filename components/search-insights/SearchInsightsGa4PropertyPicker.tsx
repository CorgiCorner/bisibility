"use client";

import { Ga4PropertyManualEntry } from "@/components/integrations/Ga4PropertyManualEntry";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { ModuleMark } from "@/components/ui/ModuleMark";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { GoogleLogoIcon as GoogleLogo } from "@phosphor-icons/react/dist/csr/GoogleLogo";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useId } from "react";
import {
  GA4_PICKER_LIST_LINK,
  GA4_PICKER_MANUAL_LINK,
  GA4_PICKER_NOT_NOW,
  GA4_PICKER_PROMISE,
  GA4_PICKER_PROPERTY_LABEL,
  GA4_PICKER_TITLE,
  GA4_PICKER_USE,
} from "./search-insights-copy";

const LOAD_PREFIX = "Couldn't load your GA4 properties. ";
const EMPTY_PROPERTIES =
  "This Google account returned no Google Analytics 4 properties. Enter the numeric Property ID manually or use a different account.";
/** Hit padding with a matching negative inset so the copy, not the box, shares the field edge. */
const MODE_LINK =
  "inline-flex min-h-6 items-center self-start rounded-control -ms-2 px-2 text-left text-[11.5px] leading-5 text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid";

export type SearchInsightsGa4PropertyPickerProps = {
  cancelling: boolean;
  manualEntry: boolean;
  onCancel: () => void;
  onManualEntryChange: (value: boolean) => void;
  onPropertyChange: (value: string) => void;
  onPropertyErrorChange: (value: string | null) => void;
  onRetry?: () => void;
  onSelect: () => void;
  pending: boolean;
  property: string;
  propertyError: string | null;
  retrying?: boolean;
  setup: GoogleOAuthSetup;
};

function DiscoveryMessage({ setup }: Readonly<{ setup: GoogleOAuthSetup }>) {
  if (setup.error?.startsWith(LOAD_PREFIX)) {
    return (
      <span className="flex flex-col gap-1">
        <span>Couldn't load your GA4 properties.</span>
        <span>{setup.error.slice(LOAD_PREFIX.length)}</span>
      </span>
    );
  }
  return <span>{setup.error ?? EMPTY_PROPERTIES}</span>;
}

export function SearchInsightsGa4PropertyPicker({
  cancelling,
  manualEntry,
  onCancel,
  onManualEntryChange,
  onPropertyChange,
  onPropertyErrorChange,
  onRetry,
  onSelect,
  pending,
  property,
  propertyError,
  retrying = false,
  setup,
}: Readonly<SearchInsightsGa4PropertyPickerProps>) {
  const promiseId = useId();
  const properties = setup.properties;
  const showSelect = properties.length > 0 && !manualEntry;

  function openManual() {
    onManualEntryChange(true);
    onPropertyChange("");
    onPropertyErrorChange(null);
  }

  function closeManual() {
    onManualEntryChange(false);
    onPropertyChange(setup.preferredProperty ?? properties[0]?.value ?? "");
    onPropertyErrorChange(null);
  }

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div className="flex items-start gap-3">
          <ModuleMark
            bordered
            className="shrink-0"
            compact
            icon={GoogleLogo}
            label="Google logo"
            variant="soft"
          />
          <div className="min-w-0">
            <h2 className="m-0 text-ui-body font-semibold">{GA4_PICKER_TITLE}</h2>
            <p className="m-0 mt-1 text-ui-caption leading-normal text-fg-muted" id={promiseId}>
              {GA4_PICKER_PROMISE}
            </p>
          </div>
        </div>
        <div className="min-w-0">
          {showSelect ? (
            <>
              <FieldLabel label={GA4_PICKER_PROPERTY_LABEL} />
              <MenuSelect
                ariaDescribedBy={promiseId}
                ariaLabel="Google Analytics property"
                onChange={(value) => {
                  onPropertyChange(value);
                  onPropertyErrorChange(null);
                  onManualEntryChange(false);
                }}
                options={properties.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                triggerClassName="mt-1.5 min-h-[42px] w-full justify-between"
                value={property}
              />
              <button className={`${MODE_LINK} mt-1.5`} onClick={openManual} type="button">
                {GA4_PICKER_MANUAL_LINK}
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {properties.length === 0 ? (
                <div className="flex gap-2 rounded-control bg-bg-sunken px-3 py-2.5 text-[12px] leading-5 text-fg-muted">
                  <WarningCircle
                    aria-hidden
                    className="mt-0.5 shrink-0 text-yellow-text"
                    size={15}
                    weight="regular"
                  />
                  <DiscoveryMessage setup={setup} />
                </div>
              ) : (
                <button className={`${MODE_LINK} gap-1`} onClick={closeManual} type="button">
                  <ArrowLeft aria-hidden className="shrink-0" size={12} weight="regular" />
                  {GA4_PICKER_LIST_LINK}
                </button>
              )}
              <Ga4PropertyManualEntry
                hasOptions={properties.length > 0}
                manualEntry
                onErrorChange={onPropertyErrorChange}
                onManualEntryChange={onManualEntryChange}
                onPropertyChange={onPropertyChange}
                onSelect={onSelect}
                pending={pending}
                property={property}
                propertyError={propertyError}
                readOnly={false}
              />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">
        <Button loading={cancelling} onClick={onCancel} type="button" variant="ghost">
          {GA4_PICKER_NOT_NOW}
        </Button>
        {onRetry ? (
          <Button
            loading={retrying}
            loadingLabel="Retrying…"
            onClick={onRetry}
            size="xs"
            type="button"
            variant="secondary"
          >
            Retry
          </Button>
        ) : null}
        {showSelect ? (
          <Button
            className="w-auto"
            disabled={!property}
            loading={pending}
            loadingLabel="Connecting…"
            onClick={onSelect}
            type="button"
            variant="secondary"
          >
            {GA4_PICKER_USE}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
