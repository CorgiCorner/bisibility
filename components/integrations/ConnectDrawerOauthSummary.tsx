import type { IntegrationProviderData } from "@/lib/integrations/types";
import {
  CheckCircleIcon as CheckCircle,
  GoogleLogoIcon as GoogleLogo,
} from "@phosphor-icons/react";
import { GoogleScopes } from "./ConnectDrawerScopes";

export function GoogleConnectionIntro({
  connected,
  needsReauth,
  provider,
}: Readonly<{
  connected: boolean;
  needsReauth: boolean;
  provider: IntegrationProviderData;
}>) {
  return (
    <>
      <div className="flex items-center gap-[11px]">
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-bg-elev text-blue-text">
          <GoogleLogo aria-hidden size={20} weight="fill" />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-[13.5px] font-semibold text-fg">
            {connected
              ? "Google account connected"
              : needsReauth
                ? "Reconnect your Google account"
                : "Connect your Google account"}
          </h3>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">
            {provider.id === "gsc"
              ? "Choose from the Search Console properties verified for that account."
              : `Authorize read-only access to ${provider.name}.`}
          </p>
        </div>
      </div>
      <p className="m-0 rounded-[9px] bg-bg-elev px-3 py-2 text-[11.5px] leading-5 text-fg-muted">
        Google OAuth handles access for this connection. No API key is required.
      </p>
    </>
  );
}

export function GoogleConnectedSummary({ property }: Readonly<{ property?: string }>) {
  return (
    <div className="rounded-[11px] border border-green bg-bg-elev p-3.5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-green-text">
        <CheckCircle aria-hidden size={16} weight="fill" />
        Connected
      </div>
      <dl className="m-0 mt-3 grid gap-2">
        <div>
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
            Selected property
          </dt>
          <dd className="m-0 mt-1 break-all font-mono text-[12.5px] text-fg">
            {property || "Not selected"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function GoogleSelectionResult({
  error,
  savedProperty,
  scopes,
}: Readonly<{
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
          <CheckCircle aria-hidden size={16} weight="fill" />
          Connected to {savedProperty}
        </p>
      ) : null}
      {error ? (
        <p className="m-0 text-[12.5px] leading-5 text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      <GoogleScopes scopes={scopes} />
    </>
  );
}
