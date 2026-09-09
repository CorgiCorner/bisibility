"use client";

import { permissionLabel } from "@/components/integrations/ConnectDrawerScopes";
import { ConnectedGoogleAccountFooter } from "@/components/integrations/ConnectedGoogleAccountFooter";
import { Button } from "@/components/ui/Button";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { PillBadge } from "@/components/ui/Pill";
import { googlePropertyDisplayName } from "@/lib/integrations/google-property-grouping";
import type { GoogleOAuthSetup, GooglePropertyOption } from "@/lib/integrations/types";
import {
  type SearchSyncPreflightPlan,
  searchSyncPreflightCopy,
} from "@/lib/search-insights/sync/plan";
import type { ReactNode } from "react";

type SearchInsightsOauthSelectionProps = {
  accountEmail?: string;
  onDisconnect: () => void;
  onPropertyChange: (value: string) => void;
  onPropertyErrorChange: (value: string | null) => void;
  onSelect: () => void;
  pending: boolean;
  property: string;
  setup: GoogleOAuthSetup;
  switchAccountHref: string;
  syncPlan: SearchSyncPreflightPlan;
};

function propertyBadge(kind: GooglePropertyOption["kind"]) {
  return kind === "domain" ? "DOMAIN" : "URL PREFIX";
}

function propertyCoverage(kind: GooglePropertyOption["kind"]) {
  return kind === "domain" ? "covers every subdomain" : "covers this URL prefix";
}

function selectedContent(option: MenuSelectOption | undefined): ReactNode {
  if (!option) return null;
  const property = option as GooglePropertyOption;
  return (
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_max-content] items-center gap-2">
      <span className="min-w-0 truncate">{googlePropertyDisplayName(property.value)}</span>
      <PillBadge className="justify-self-end" size="xs">
        {propertyBadge(property.kind)}
      </PillBadge>
    </span>
  );
}

function menuOption(option: GooglePropertyOption): MenuSelectOption {
  return {
    ...option,
    label: googlePropertyDisplayName(option.value),
    trailing: <PillBadge size="xs">{propertyBadge(option.kind)}</PillBadge>,
  };
}

export function SearchInsightsOauthSelection({
  accountEmail,
  onDisconnect,
  onPropertyChange,
  onPropertyErrorChange,
  onSelect,
  pending,
  property,
  setup,
  switchAccountHref,
  syncPlan,
}: Readonly<SearchInsightsOauthSelectionProps>) {
  const selectedProperty = setup.properties.find((option) => option.value === property);
  return (
    <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex flex-col gap-4 p-5 sm:p-7">
        <div>
          <p className="m-0 mb-1.5 font-sans tabular-nums text-[10.5px] uppercase tracking-[0.7px] text-fg-muted">
            VERIFIED PROPERTY
          </p>
          <MenuSelect
            ariaLabel="Search Console property"
            menuMaxHeight="min(192px, calc(100dvh - 84px))"
            onChange={(value) => {
              onPropertyChange(value);
              onPropertyErrorChange(null);
            }}
            options={setup.properties.map(menuOption)}
            pinCaret
            selectedContent={selectedContent}
            triggerClassName="min-h-[42px] w-full justify-between"
            value={property}
          />
          {selectedProperty ? (
            <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
              {permissionLabel(selectedProperty.permissionLevel)} ·{" "}
              {propertyCoverage(selectedProperty.kind)}
            </p>
          ) : null}
        </div>
        <div className="rounded-control border border-border bg-bg-sunken px-4 py-3 text-[12px] leading-5 text-fg-muted">
          {searchSyncPreflightCopy(syncPlan)}
        </div>
        <div className="flex w-full items-center justify-end pt-0.5">
          <Button
            disabled={!property}
            loading={pending}
            loadingLabel="Starting…"
            onClick={onSelect}
            type="button"
            variant="primary"
          >
            Start the import
          </Button>
        </div>
      </div>
      <ConnectedGoogleAccountFooter
        accountEmail={accountEmail}
        layout="standalone"
        onDisconnect={onDisconnect}
        switchAccountHref={switchAccountHref}
      />
    </div>
  );
}
