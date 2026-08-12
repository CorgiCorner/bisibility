"use client";

import { Button, MenuSelect } from "@/components/ui";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import { permissionLabel } from "./ConnectDrawerScopes";
import { Ga4PropertyManualEntry } from "./Ga4PropertyManualEntry";

type ConnectDrawerOauthSelectionProps = {
  allowManualEntry: boolean;
  isGa4: boolean;
  manualEntry: boolean;
  onManualEntryChange: (value: boolean) => void;
  onPropertyChange: (value: string) => void;
  onPropertyErrorChange: (value: string | null) => void;
  onSelect: () => void;
  pending: boolean;
  property: string;
  propertyError: string | null;
  readOnly: boolean;
  setup: GoogleOAuthSetup;
};

export function ConnectDrawerOauthSelection({
  allowManualEntry,
  isGa4,
  manualEntry,
  onManualEntryChange,
  onPropertyChange,
  onPropertyErrorChange,
  onSelect,
  pending,
  property,
  propertyError,
  readOnly,
  setup,
}: Readonly<ConnectDrawerOauthSelectionProps>) {
  const propertyOptions = setup.properties;
  const selectedProperty = propertyOptions.find((option) => option.value === property);

  return (
    <div className="flex flex-col gap-3 rounded-[11px] border border-border-strong bg-bg-elev p-3.5">
      <div>
        <p className="m-0 text-[12.5px] font-semibold text-fg">
          {isGa4 ? "Select a Google Analytics 4 property" : "Select a verified property"}
        </p>
        <p className="m-0 mt-1 text-[11.5px] leading-5 text-fg-muted">
          {isGa4
            ? "Choose a property returned by Google Analytics, or enter its numeric ID manually."
            : "bisibility stores the exact property ID returned by Google."}
        </p>
      </div>
      {propertyOptions.length > 0 ? (
        <>
          <MenuSelect
            ariaLabel={isGa4 ? "Google Analytics property" : "Search Console property"}
            onChange={(value) => {
              onPropertyChange(value);
              onPropertyErrorChange(null);
              onManualEntryChange(false);
            }}
            options={propertyOptions}
            triggerClassName="min-h-[42px] w-full justify-between"
            value={property}
          />
          {selectedProperty ? (
            <div className="rounded-[9px] bg-bg-sunken px-3 py-2.5 text-[11.5px] leading-5 text-fg-muted">
              <span className="block break-all font-mono text-[12px] text-fg">
                {selectedProperty.value}
              </span>
              {permissionLabel(selectedProperty.permissionLevel)}
              {selectedProperty.kind === "ga4" ? null : (
                <>
                  {" · "}
                  {selectedProperty.kind === "domain" ? "Domain property" : "URL-prefix property"}
                </>
              )}
            </div>
          ) : null}
          {!manualEntry ? (
            <Button
              disabled={!property || readOnly}
              loading={pending}
              loadingLabel="Connecting…"
              onClick={onSelect}
              type="button"
            >
              Use selected property
            </Button>
          ) : null}
        </>
      ) : (
        <div className="flex gap-2 rounded-[9px] bg-bg-sunken px-3 py-2.5 text-[12px] leading-5 text-fg-muted">
          <WarningCircle aria-hidden className="mt-0.5 shrink-0 text-yellow-text" size={15} />
          <span>
            {setup.error ??
              (isGa4
                ? "This Google account returned no Google Analytics 4 properties. Enter the numeric Property ID manually or use a different account."
                : "This Google account has no verified Search Console properties. Verify a property or connect a different account.")}
          </span>
        </div>
      )}
      {isGa4 && allowManualEntry ? (
        <Ga4PropertyManualEntry
          hasOptions={Boolean(propertyOptions.length)}
          manualEntry={manualEntry}
          onErrorChange={onPropertyErrorChange}
          onManualEntryChange={onManualEntryChange}
          onPropertyChange={onPropertyChange}
          onSelect={onSelect}
          pending={pending}
          property={property}
          propertyError={propertyError}
          readOnly={readOnly}
        />
      ) : null}
    </div>
  );
}
