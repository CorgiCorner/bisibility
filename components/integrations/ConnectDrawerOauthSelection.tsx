"use client";

import { Button, FieldLabel, MenuSelect, type MenuSelectOption, PillBadge } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  googlePropertyDisplayName,
  googlePropertyMatchesDomain,
  groupGoogleProperties,
} from "@/lib/integrations/google-property-grouping";
import type { GoogleOAuthSetup, GooglePropertyOption } from "@/lib/integrations/types";
import { projectSearchSyncSchema } from "@/lib/schemas/project";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";
import {
  SEARCH_SYNC_PACE_OPTIONS,
  SEARCH_SYNC_RETENTION_OPTIONS,
  searchSyncPaceLabel,
  searchSyncPreflightEstimate,
  searchSyncRetentionLabel,
} from "@/lib/settings/search-sync-config";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { permissionLabel } from "./ConnectDrawerScopes";
import { Ga4PropertyManualEntry } from "./Ga4PropertyManualEntry";

type SearchSyncSelection = Pick<SearchSyncPreflightPlan, "pace" | "retentionMonths">;
const searchSyncSelectionSchema = projectSearchSyncSchema.pick({
  pace: true,
  retentionMonths: true,
});
const depthOptions = SEARCH_SYNC_RETENTION_OPTIONS.map((value) => ({
  label: searchSyncRetentionLabel(value),
  value: String(value),
}));
const paceOptions = SEARCH_SYNC_PACE_OPTIONS.map((value) => ({
  label: searchSyncPaceLabel(value),
  value,
}));
const planFields = [
  ["retentionMonths", "Import depth", depthOptions],
  ["pace", "Import speed", paceOptions],
] as const;
function propertyLabel(option: GoogleOAuthSetup["properties"][number]) {
  return option.kind === "ga4" ? option.label : googlePropertyDisplayName(option.value);
}
function propertyBadge(kind: GoogleOAuthSetup["properties"][number]["kind"]) {
  if (kind === "domain") return "DOMAIN";
  if (kind === "url-prefix") return "URL PREFIX";
  return "GA4";
}
function propertySelectionLabel(option: MenuSelectOption | undefined): ReactNode {
  if (!option) return null;
  const property = option as GoogleOAuthSetup["properties"][number];
  return (
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_max-content] items-center gap-2">
      <span className="min-w-0 truncate">{propertyLabel(property)}</span>
      <PillBadge className="justify-self-end" size="xs">
        {propertyBadge(property.kind)}
      </PillBadge>
    </span>
  );
}
type ConnectDrawerOauthSelectionBaseProps = {
  accountFooter?: ReactNode;
  allowManualEntry: boolean;
  footerAction?: ReactNode;
  onCancel?: () => void;
  manualEntry: boolean;
  onManualEntryChange: (value: boolean) => void;
  onPropertyChange: (value: string) => void;
  onPropertyErrorChange: (value: string | null) => void;
  onSelect: (selection?: SearchSyncSelection) => void;
  pending: boolean;
  property: string;
  propertyError: string | null;
  readOnly: boolean;
  retryAction?: ReactNode;
  setup: GoogleOAuthSetup;
};

type ConnectDrawerOauthSelectionProps = ConnectDrawerOauthSelectionBaseProps &
  ({ isGa4: true; syncPlan?: never } | { isGa4: false; syncPlan: SearchSyncPreflightPlan });

export function ConnectDrawerOauthSelection({
  accountFooter,
  allowManualEntry,
  footerAction,
  isGa4,
  manualEntry,
  onManualEntryChange,
  onCancel,
  onPropertyChange,
  onPropertyErrorChange,
  onSelect,
  pending,
  property,
  propertyError,
  readOnly,
  retryAction,
  setup,
  syncPlan,
}: Readonly<ConnectDrawerOauthSelectionProps>) {
  const { pace = "normal", retentionMonths = 3 } = syncPlan ?? {};
  const form = useForm<SearchSyncSelection>({
    defaultValues: { pace, retentionMonths },
    resolver: zodResolver(searchSyncSelectionSchema),
  });
  const selectedPlan = form.watch();
  const estimate = isGa4 ? null : searchSyncPreflightEstimate(selectedPlan);
  const propertyOptions = setup.properties;
  const selectedProperty = propertyOptions.find((option) => option.value === property);
  const grouped = isGa4
    ? null
    : groupGoogleProperties({
        activeValue: setup.preferredProperty,
        archived: setup.archivedProperties ?? [],
        options: propertyOptions,
        projectDomain: setup.projectDomain ?? "",
      });
  function select() {
    if (isGa4) return onSelect();
    void form.handleSubmit(onSelect)();
  }
  const menuOption = (option: GooglePropertyOption, secondary?: string, disabled = false) => ({
    ...option,
    disabled,
    label: propertyLabel(option),
    secondary,
    trailing: <PillBadge size="xs">{propertyBadge(option.kind)}</PillBadge>,
  });
  const groups = grouped
    ? [
        {
          id: "active",
          label: "Active",
          options: grouped.active ? [menuOption(grouped.active)] : [],
        },
        {
          id: "archived",
          label: "Archived",
          options: grouped.archived.map((option) =>
            menuOption(
              option,
              `${googlePropertyMatchesDomain(option.value, setup.projectDomain ?? "") ? "matches this project · " : ""}last synced ${option.lastSyncedDate}${option.available ? "" : " · Not available to this Google account"}`,
              !option.available,
            ),
          ),
        },
        {
          id: "matching",
          label: "Matches this project",
          options: grouped.matching.map((option) => menuOption(option)),
        },
        {
          id: "other",
          label: "Other properties",
          options: grouped.other.map((option) => menuOption(option)),
        },
      ]
    : undefined;
  const ga4ManualEntry =
    isGa4 && allowManualEntry ? (
      <Ga4PropertyManualEntry
        hasOptions={Boolean(propertyOptions.length)}
        manualEntry={manualEntry}
        onErrorChange={onPropertyErrorChange}
        onManualEntryChange={onManualEntryChange}
        onPropertyChange={onPropertyChange}
        onSelect={select}
        pending={pending}
        property={property}
        propertyError={propertyError}
        readOnly={readOnly}
      />
    ) : null;

  return (
    <div className="flex w-full flex-col gap-3 rounded-control border border-border bg-bg-elev p-3.5">
      <div>
        <p className="m-0 text-[12.5px] font-semibold text-fg">
          {isGa4 ? "Select a Google Analytics 4 property" : "Select a verified property"}
        </p>
        <p className="m-0 mt-1 text-[11.5px] leading-5 text-fg-muted">
          {isGa4
            ? "Choose a property returned by Google Analytics, or enter its numeric ID manually."
            : "Domain properties cover all subdomains; URL prefixes cover one path."}
        </p>
      </div>
      {propertyOptions.length > 0 ? (
        !manualEntry ? (
          <>
            <MenuSelect
              ariaLabel={isGa4 ? "Google Analytics property" : "Search Console property"}
              onChange={(value) => {
                onPropertyChange(value);
                onPropertyErrorChange(null);
                onManualEntryChange(false);
              }}
              {...(groups
                ? { groups }
                : { options: propertyOptions.map((option) => menuOption(option)) })}
              selectedContent={propertySelectionLabel}
              triggerClassName="min-h-[42px] w-full justify-between"
              value={property}
            />
            {!isGa4 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {planFields.map(([name, label, options]) => (
                  <div key={name}>
                    <FieldLabel label={label} />
                    <MenuSelect
                      ariaLabel={label}
                      onChange={(value) =>
                        form.setValue(
                          name as keyof SearchSyncSelection,
                          (name === "retentionMonths" ? Number(value) : value) as never,
                        )
                      }
                      options={options}
                      triggerClassName="mt-1.5 w-full justify-between"
                      value={String(selectedPlan[name as keyof SearchSyncSelection])}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {estimate ? (
              <p className="m-0 text-[11.5px] leading-5 text-fg-muted">{estimate}</p>
            ) : null}
            {selectedProperty ? (
              <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
                {isGa4
                  ? `Property ID ${selectedProperty.value}`
                  : `${permissionLabel(selectedProperty.permissionLevel)} · ${selectedProperty.kind === "domain" ? "Domain property" : "URL prefix property"}`}
              </p>
            ) : null}
            {ga4ManualEntry}
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {onCancel || footerAction ? (
                <div
                  className="mr-auto flex flex-wrap items-center gap-1"
                  data-slot="selection-secondary-actions"
                >
                  {onCancel ? (
                    <Button onClick={onCancel} type="button" variant="ghost">
                      Cancel
                    </Button>
                  ) : null}
                  {footerAction}
                </div>
              ) : null}
              <Button
                className="w-auto"
                disabled={!property || readOnly}
                loading={pending}
                loadingLabel="Connecting…"
                onClick={select}
                type="button"
                variant="primary"
              >
                Use selected property
              </Button>
            </div>
          </>
        ) : null
      ) : (
        <div className="flex gap-2 rounded-control bg-bg-sunken px-3 py-2.5 text-[12px] leading-5 text-fg-muted">
          <WarningCircle
            aria-hidden
            className="mt-0.5 shrink-0 text-yellow-text"
            size={15}
            weight="regular"
          />
          <span>
            {isGa4 && setup.error?.startsWith("Couldn't load your GA4 properties. ") ? (
              <span className="flex flex-col gap-1">
                <span>Couldn't load your GA4 properties.</span>
                <span>{setup.error.slice("Couldn't load your GA4 properties. ".length)}</span>
              </span>
            ) : (
              (setup.error ??
              (isGa4
                ? "This Google account returned no Google Analytics 4 properties. Enter the numeric Property ID manually or use a different account."
                : "This Google account has no verified Search Console properties. Verify a property or connect a different account."))
            )}
          </span>
        </div>
      )}
      {!propertyOptions.length || manualEntry ? ga4ManualEntry : null}
      {isGa4 && !propertyOptions.length && (retryAction || footerAction) ? (
        <div className="flex items-center justify-between gap-2">
          <div>{retryAction}</div>
          <div>{footerAction}</div>
        </div>
      ) : null}
      {accountFooter}
    </div>
  );
}
