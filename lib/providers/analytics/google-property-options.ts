import type { GooglePropertyOption } from "@/lib/integrations/types";
import type { Ga4PropertySummary, GoogleSite } from "./google-client";

function propertyKind(siteUrl: string): GooglePropertyOption["kind"] {
  return siteUrl.startsWith("sc-domain:") ? "domain" : "url-prefix";
}

function propertyLabel(siteUrl: string) {
  return siteUrl.startsWith("sc-domain:")
    ? `${siteUrl.slice("sc-domain:".length)} (Domain property)`
    : `${siteUrl} (URL-prefix property)`;
}

export function gscPropertyOptions(sites: readonly GoogleSite[]): GooglePropertyOption[] {
  return sites
    .filter((site) => site.permissionLevel !== "siteUnverifiedUser")
    .map((site) => ({
      kind: propertyKind(site.siteUrl),
      label: propertyLabel(site.siteUrl),
      permissionLevel: site.permissionLevel,
      value: site.siteUrl,
    }))
    .sort((left, right) => {
      const kindDelta = Number(left.kind === "url-prefix") - Number(right.kind === "url-prefix");
      return kindDelta || left.label.localeCompare(right.label);
    });
}

export function ga4PropertyOptions(
  properties: readonly Ga4PropertySummary[],
): GooglePropertyOption[] {
  return properties
    .map((property) => ({
      kind: "ga4" as const,
      label: `${property.displayName} (${property.propertyId})`,
      permissionLevel: property.accountDisplayName,
      value: property.propertyId,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
