"use client";

import type { OAuthScope } from "@/components/integrations/provider-auth";
import { IdChip } from "@/components/ui/IdChip";
import type { GooglePropertyOption } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";

export function GooglePropertyDetails({ property }: Readonly<{ property: GooglePropertyOption }>) {
  const t = useTranslations("projectIntegrations.oauth");
  return (
    <p className="m-0 mt-1.5 text-[11.5px] leading-5 text-fg-muted">
      {property.kind === "ga4" ? (
        <span className="inline-flex items-center gap-1.5">
          {t("propertyId")}{" "}
          <IdChip copyLabel={t("copyPropertyId")} size="xs" value={property.value} />
        </span>
      ) : (
        `${permissionLabel(property.permissionLevel, t)} · ${property.kind === "domain" ? t("domainProperty") : t("urlPrefixProperty")}`
      )}
    </p>
  );
}

export function permissionLabel(permissionLevel: string, t?: ReturnType<typeof useTranslations>) {
  if (!t) return permissionLevel;
  if (permissionLevel === "siteOwner") return t("permissionOwner");
  if (permissionLevel === "siteFullUser") return t("permissionFull");
  if (permissionLevel === "siteRestrictedUser") return t("permissionRestricted");
  return permissionLevel;
}

function scopeLabel(scope: OAuthScope | string, t: ReturnType<typeof useTranslations>) {
  if (scope === "analytics_readonly") return t("scopeAnalyticsReadonly");
  if (scope === "search_console_readonly") return t("scopeSearchConsoleReadonly");
  if (scope === "account_identity") return t("scopeAccountIdentity");
  return scope;
}

export function GoogleScopes({
  granted,
  scopes,
}: Readonly<{ granted: boolean; scopes: readonly (OAuthScope | string)[] }>) {
  const t = useTranslations("projectIntegrations.oauth");
  return (
    <div className="text-[10.5px] leading-[1.6] text-fg-muted">
      <span className="block">
        {t("access", { state: granted ? t("accessGranted") : t("accessRequested") })}
      </span>
      {scopes.map((scope) => (
        <span className="block" key={scope}>
          · {scopeLabel(scope, t)}
        </span>
      ))}
    </div>
  );
}
