import { InlineCallout } from "@/components/ui/InlineCallout";
import { PillBadge } from "@/components/ui/Pill";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { googlePropertyDisplayName } from "@/lib/integrations/google-property-grouping";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useTranslations } from "next-intl";
import { GoogleScopes } from "./ConnectDrawerScopes";
import type { OAuthScope } from "./provider-auth";

function kindBadge(property: string) {
  return property.startsWith("sc-domain:") ? "DOMAIN" : "URL PREFIX";
}

export function GoogleConnectionIntro({
  connected,
  needsReauth,
  provider,
  selecting,
}: Readonly<{
  connected: boolean;
  needsReauth: boolean;
  provider: IntegrationProviderData;
  selecting: boolean;
}>) {
  const t = useTranslations("projectIntegrations.oauth");
  const title = connected
    ? t("googleConnection")
    : needsReauth
      ? t("reconnectGoogle")
      : t("connectGoogle");
  const subtitle =
    provider.id === "gsc"
      ? selecting
        ? t("gscSelecting")
        : t("gscProject")
      : selecting
        ? t("ga4Selecting")
        : t("ga4Project");
  return (
    <>
      <div className="flex items-center gap-[11px]">
        <ProviderLogo
          alt={t("googleLogo")}
          domain={provider.logoDomain ?? "google.com"}
          fallbackIcon={provider.icon}
          size="sm"
          tint={provider.tint}
        />
        <div className="min-w-0">
          <h3 className="m-0 text-[13.5px] font-semibold text-fg">{title}</h3>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">{subtitle}</p>
        </div>
      </div>
      <InlineCallout className="py-2 text-[11.5px] leading-5" role="note" tint="neutral">
        {t("oauthHelp")}
      </InlineCallout>
    </>
  );
}

export function GoogleConnectedSummary({
  property,
  providerId,
}: Readonly<{ property?: string; providerId: string }>) {
  const t = useTranslations("projectIntegrations.oauth");
  const isGsc = providerId === "gsc";
  return (
    <div className="rounded-control border border-border bg-bg-elev p-3.5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-green-text">
        <CheckCircle aria-hidden size={16} weight="regular" /> {t("connected")}
      </div>
      <dl className="m-0 mt-3 grid gap-2">
        <div>
          <dt className="text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
            {t("selectedProperty")}
          </dt>
          <dd className="m-0 mt-1 flex min-w-0 items-center justify-between gap-2 text-[12.5px] text-fg">
            <span className="min-w-0 truncate">
              {property
                ? isGsc
                  ? googlePropertyDisplayName(property)
                  : property
                : t("notSelected")}
            </span>
            {property && isGsc ? <PillBadge size="xs">{kindBadge(property)}</PillBadge> : null}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function GoogleSelectionResult({
  connected,
  error,
  savedProperty,
  scopes,
}: Readonly<{
  connected: boolean;
  error: string | null;
  savedProperty: string | null;
  scopes: readonly (OAuthScope | string)[];
}>) {
  const t = useTranslations("projectIntegrations.oauth");
  return (
    <>
      {savedProperty ? (
        <p
          className="m-0 flex items-center gap-2 text-[12.5px] font-semibold text-green-text"
          role="status"
        >
          <CheckCircle aria-hidden size={16} weight="regular" />
          {t("connectedTo", { property: googlePropertyDisplayName(savedProperty) })}
        </p>
      ) : null}
      {error ? (
        <p className="m-0 text-[12.5px] leading-5 text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      <GoogleScopes granted={connected} scopes={scopes} />
    </>
  );
}
