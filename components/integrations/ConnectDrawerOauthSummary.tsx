import { InlineCallout, PillBadge, ProviderLogo } from "@/components/ui";
import { googlePropertyDisplayName } from "@/lib/integrations/google-property-grouping";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import { GoogleScopes } from "./ConnectDrawerScopes";

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
  const title = connected
    ? "Google connection"
    : needsReauth
      ? "Reconnect your Google account"
      : "Connect your Google account";
  const subtitle =
    provider.id === "gsc"
      ? selecting
        ? "Choose from the Search Console properties verified for that account."
        : "Search Console property for this project"
      : selecting
        ? "Choose a Google Analytics property returned for that account."
        : "Google Analytics property for this project";
  return (
    <>
      <div className="flex items-center gap-[11px]">
        <ProviderLogo
          alt="Google logo"
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
        Google OAuth handles access for this connection. No API key is required.
      </InlineCallout>
    </>
  );
}

export function GoogleConnectedSummary({
  property,
  providerId,
}: Readonly<{ property?: string; providerId: string }>) {
  const isGsc = providerId === "gsc";
  return (
    <div className="rounded-control border border-border bg-bg-elev p-3.5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-green-text">
        <CheckCircle aria-hidden size={16} weight="regular" /> Connected
      </div>
      <dl className="m-0 mt-3 grid gap-2">
        <div>
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
            Selected property
          </dt>
          <dd className="m-0 mt-1 flex min-w-0 items-center justify-between gap-2 font-mono text-[12.5px] text-fg">
            <span className="min-w-0 truncate">
              {property ? (isGsc ? googlePropertyDisplayName(property) : property) : "Not selected"}
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
  scopes: readonly string[];
}>) {
  return (
    <>
      {savedProperty ? (
        <p
          className="m-0 flex items-center gap-2 text-[12.5px] font-semibold text-green-text"
          role="status"
        >
          <CheckCircle aria-hidden size={16} weight="regular" />
          Connected to {googlePropertyDisplayName(savedProperty)}
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
