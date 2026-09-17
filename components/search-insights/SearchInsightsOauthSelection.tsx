"use client";

import { ConnectedGoogleAccountFooter } from "@/components/integrations/ConnectedGoogleAccountFooter";
import { Button } from "@/components/ui/Button";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { PillBadge } from "@/components/ui/Pill";
import { googlePropertyDisplayName } from "@/lib/integrations/google-property-grouping";
import type { GoogleOAuthSetup, GooglePropertyOption } from "@/lib/integrations/types";
import {
  type SearchSyncPreflightPlan,
  searchSyncPreflightFacts,
} from "@/lib/search-insights/sync/plan";
import { useTranslations } from "next-intl";
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

function propertyBadge(kind: GooglePropertyOption["kind"], t: ReturnType<typeof useTranslations>) {
  return kind === "domain" ? t("domainBadge") : t("urlPrefixBadge");
}

function propertyCoverage(
  kind: GooglePropertyOption["kind"],
  t: ReturnType<typeof useTranslations>,
) {
  return kind === "domain" ? t("domainCoverage") : t("urlPrefixCoverage");
}

function permissionLabel(permissionLevel: string, t: ReturnType<typeof useTranslations>) {
  if (permissionLevel === "siteOwner") return t("permissionOwner");
  if (permissionLevel === "siteFullUser") return t("permissionFull");
  if (permissionLevel === "siteRestrictedUser") return t("permissionRestricted");
  return permissionLevel;
}

function selectedContent(
  option: MenuSelectOption | undefined,
  t: ReturnType<typeof useTranslations>,
): ReactNode {
  if (!option) return null;
  const property = option as GooglePropertyOption;
  return (
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_max-content] items-center gap-2">
      <span className="min-w-0 truncate">{googlePropertyDisplayName(property.value)}</span>
      <PillBadge className="justify-self-end" size="xs">
        {propertyBadge(property.kind, t)}
      </PillBadge>
    </span>
  );
}

function menuOption(
  option: GooglePropertyOption,
  t: ReturnType<typeof useTranslations>,
): MenuSelectOption {
  return {
    ...option,
    label: googlePropertyDisplayName(option.value),
    trailing: <PillBadge size="xs">{propertyBadge(option.kind, t)}</PillBadge>,
  };
}

function estimatedDuration(durationHours: number) {
  if (durationHours < 24) {
    return { duration: Math.round(durationHours), durationUnit: "hours" as const };
  }
  const days = durationHours / 24;
  return {
    duration:
      Math.abs(days - Math.round(days)) < 0.15 ? Math.round(days) : Math.round(days * 2) / 2,
    durationUnit: "days" as const,
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
  const t = useTranslations("projectSearchInsights.oauthSelection");
  const preflight = searchSyncPreflightFacts(syncPlan);
  const duration = estimatedDuration(preflight.durationHours);
  const selectedProperty = setup.properties.find((option) => option.value === property);
  return (
    <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex flex-col gap-4 p-5 sm:p-7">
        <div>
          <p className="m-0 mb-1.5 font-sans tabular-nums text-[10.5px] uppercase tracking-[0.7px] text-fg-muted">
            {t("verifiedProperty")}
          </p>
          <MenuSelect
            ariaLabel={t("propertyAria")}
            menuMaxHeight="min(192px, calc(100dvh - 84px))"
            onChange={(value) => {
              onPropertyChange(value);
              onPropertyErrorChange(null);
            }}
            options={setup.properties.map((option) => menuOption(option, t))}
            pinCaret
            selectedContent={(option) => selectedContent(option, t)}
            triggerClassName="min-h-[42px] w-full justify-between"
            value={property}
          />
          {selectedProperty ? (
            <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
              {permissionLabel(selectedProperty.permissionLevel, t)} ·{" "}
              {propertyCoverage(selectedProperty.kind, t)}
            </p>
          ) : null}
        </div>
        <div className="rounded-control border border-border bg-bg-sunken px-4 py-3 text-[12px] leading-5 text-fg-muted">
          {t("importPlan", {
            days: syncPlan.daysTotal,
            duration: duration.duration,
            durationUnit: duration.durationUnit,
            months: syncPlan.retentionMonths,
            pace: t(syncPlan.pace),
            requests: preflight.requests,
          })}
        </div>
        <div className="flex w-full items-center justify-end pt-0.5">
          <Button
            disabled={!property}
            loading={pending}
            loadingLabel={t("starting")}
            onClick={onSelect}
            type="button"
            variant="primary"
          >
            {t("startImport")}
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
