"use client";

import { IdChip } from "@/components/ui/IdChip";
import type { GooglePropertyOption } from "@/lib/integrations/types";

export function GooglePropertyDetails({ property }: Readonly<{ property: GooglePropertyOption }>) {
  return (
    <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
      {property.kind === "ga4" ? (
        <span className="inline-flex items-center gap-1.5">
          Property ID <IdChip copyLabel="Copy property ID" size="xs" value={property.value} />
        </span>
      ) : (
        `${permissionLabel(property.permissionLevel)} · ${property.kind === "domain" ? "Domain property" : "URL prefix property"}`
      )}
    </p>
  );
}

export function permissionLabel(permissionLevel: string) {
  if (permissionLevel === "siteOwner") return "Owner";
  if (permissionLevel === "siteFullUser") return "Full user";
  if (permissionLevel === "siteRestrictedUser") return "Restricted user";
  return permissionLevel;
}

export function GoogleScopes({
  granted,
  scopes,
}: Readonly<{ granted: boolean; scopes: readonly string[] }>) {
  return (
    <div className="text-[10.5px] leading-[1.6] text-fg-muted">
      <span className="block">Access {granted ? "granted" : "requested"}:</span>
      {scopes.map((scope) => (
        <span className="block" key={scope}>
          · {scope}
        </span>
      ))}
    </div>
  );
}
