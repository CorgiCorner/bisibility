"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, MenuSelect } from "@/components/ui";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { normalizeGa4PropertyId } from "@/lib/providers/analytics/property-id";
import { appPath, asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import {
  CheckCircleIcon as CheckCircle,
  GoogleLogoIcon as GoogleLogo,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ga4PropertyManualEntry } from "./Ga4PropertyManualEntry";

export type ConnectDrawerOauthProps = {
  completePropertySelection?: (input: {
    projectId: string;
    property: string;
  }) => Promise<{ property: string }>;
  projectId?: string;
  projectRef?: ProjectRef;
  provider: IntegrationProviderData;
  scopes: readonly string[];
};

const buttonClass =
  "inline-flex w-full items-center justify-center gap-[9px] rounded-[10px] border border-border-strong bg-bg-elev px-3 py-[11px] text-[13.5px] font-semibold text-fg outline-none transition-colors hover:border-accent focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60";

function permissionLabel(permissionLevel: string) {
  if (permissionLevel === "siteOwner") return "Owner";
  if (permissionLevel === "siteFullUser") return "Full user";
  if (permissionLevel === "siteRestrictedUser") return "Restricted user";
  return permissionLevel;
}

function GoogleScopes({ scopes }: Readonly<{ scopes: readonly string[] }>) {
  return (
    <div className="font-mono text-[10.5px] leading-[1.6] text-fg-faint">
      <span className="block">Access requested:</span>
      {scopes.map((scope) => (
        <span className="block" key={scope}>
          · {scope}
        </span>
      ))}
    </div>
  );
}

export function ConnectDrawerOauth({
  completePropertySelection,
  projectId,
  projectRef,
  provider,
  scopes,
}: Readonly<ConnectDrawerOauthProps>) {
  const isGa4 = provider.id === "ga4";
  const isGsc = provider.id === "gsc";
  const isConnected = provider.status === "connected";
  const needsReauth = provider.status === "needs_reauth";
  const setup = provider.drawer.googleOAuth;
  const propertyOptions = setup?.properties ?? [];
  const [property, setProperty] = useState(
    setup?.preferredProperty ?? propertyOptions[0]?.value ?? provider.drawer.defaults.login,
  );
  const [error, setError] = useState<string | null>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(
    isGa4 &&
      Boolean(setup) &&
      (!propertyOptions.length ||
        Boolean(
          setup?.preferredProperty &&
            !propertyOptions.some((option) => option.value === setup.preferredProperty),
        )),
  );
  const [pending, setPending] = useState(false);
  const [savedProperty, setSavedProperty] = useState<string | null>(null);
  const { readOnly } = useProjectWriteMode();
  const router = useRouter();
  const selectedProperty = propertyOptions.find((option) => option.value === property);
  const scopedProjectRef = projectRef ?? (projectId ? asProjectRef(projectId) : undefined);
  const returnPath = scopedProjectRef
    ? `${appPath(scopedProjectRef, "integrations")}?connect=${provider.id}`
    : undefined;
  const href =
    projectId && scopedProjectRef
      ? googleInstallUrl({
          projectId,
          provider: provider.id as "ga4" | "gsc",
          returnPath: returnPath ?? appPath(scopedProjectRef, "integrations"),
        })
      : undefined;
  const ready = Boolean(projectId && scopedProjectRef) && !readOnly;

  async function selectProperty() {
    if (!completePropertySelection || !projectId || !property || readOnly) return;
    let selectedValue = property;
    if (isGa4) {
      const normalized = normalizeGa4PropertyId(property);
      if (!normalized.ok) {
        setPropertyError(normalized.error.message);
        return;
      }
      selectedValue = normalized.value;
      setProperty(selectedValue);
    }
    setError(null);
    setPropertyError(null);
    setPending(true);
    try {
      const result = await completePropertySelection({ projectId, property: selectedValue });
      setSavedProperty(result.property);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google connection failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[13px] border border-border bg-bg-sunken p-[18px]">
      <div className="flex items-center gap-[11px]">
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-bg-elev text-blue">
          <GoogleLogo aria-hidden size={20} weight="fill" />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-[13.5px] font-semibold text-fg">
            {isConnected
              ? "Google account connected"
              : needsReauth
                ? "Reconnect your Google account"
                : "Connect your Google account"}
          </h3>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">
            {isGsc
              ? "Choose from the Search Console properties verified for that account."
              : `Authorize read-only access to ${provider.name}.`}
          </p>
        </div>
      </div>

      <p className="m-0 rounded-[9px] bg-bg-elev px-3 py-2 text-[11.5px] leading-5 text-fg-muted">
        Google OAuth handles access for this connection. No API key is required.
      </p>

      {isConnected && !setup ? (
        <div className="rounded-[11px] border border-green bg-bg-elev p-3.5">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-green">
            <CheckCircle aria-hidden size={16} weight="fill" />
            Connected
          </div>
          <dl className="m-0 mt-3 grid gap-2">
            <div>
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-faint">
                Selected property
              </dt>
              <dd className="m-0 mt-1 break-all font-mono text-[12.5px] text-fg">
                {provider.drawer.defaults.login || "Not selected"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {setup ? (
        <div className="flex flex-col gap-3 rounded-[11px] border border-border-strong bg-bg-elev p-3.5">
          <div>
            <p className="m-0 text-[12.5px] font-semibold text-fg">
              {isGa4 ? "Select a GA4 property" : "Select a verified property"}
            </p>
            <p className="m-0 mt-1 text-[11.5px] leading-5 text-fg-muted">
              {isGa4
                ? "Choose a property returned by Google Analytics, or enter its numeric ID manually."
                : "Bisibility stores the exact property ID returned by Google."}
            </p>
          </div>
          {propertyOptions.length > 0 ? (
            <>
              <MenuSelect
                ariaLabel={isGa4 ? "Google Analytics property" : "Search Console property"}
                onChange={(value) => {
                  setProperty(value);
                  setPropertyError(null);
                  setManualEntry(false);
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
                      {selectedProperty.kind === "domain"
                        ? "Domain property"
                        : "URL-prefix property"}
                    </>
                  )}
                </div>
              ) : null}
              {!manualEntry ? (
                <Button
                  disabled={!property || readOnly}
                  loading={pending}
                  loadingLabel="Connecting…"
                  onClick={() => void selectProperty()}
                  type="button"
                >
                  Use selected property
                </Button>
              ) : null}
            </>
          ) : null}
          {!propertyOptions.length ? (
            <div className="flex gap-2 rounded-[9px] bg-bg-sunken px-3 py-2.5 text-[12px] leading-5 text-fg-muted">
              <WarningCircle aria-hidden className="mt-0.5 shrink-0 text-yellow" size={15} />
              <span>
                {setup.error ??
                  (isGa4
                    ? "This Google account returned no GA4 properties. Enter the numeric Property ID manually or use a different account."
                    : "This Google account has no verified Search Console properties. Verify a property or connect a different account.")}
              </span>
            </div>
          ) : null}
          {isGa4 ? (
            <Ga4PropertyManualEntry
              hasOptions={Boolean(propertyOptions.length)}
              manualEntry={manualEntry}
              onErrorChange={setPropertyError}
              onManualEntryChange={setManualEntry}
              onPropertyChange={setProperty}
              onSelect={() => void selectProperty()}
              pending={pending}
              property={property}
              propertyError={propertyError}
              readOnly={readOnly}
            />
          ) : null}
        </div>
      ) : null}

      {!isConnected || setup ? (
        ready && href ? (
          <a className={buttonClass} href={href}>
            <GoogleLogo aria-hidden size={17} weight="fill" />
            {setup
              ? "Use a different Google account"
              : needsReauth
                ? "Reconnect Google account"
                : "Connect Google account"}
          </a>
        ) : (
          <ProjectReadOnlyTooltip className="block">
            <button className={buttonClass} disabled type="button">
              <GoogleLogo aria-hidden size={17} weight="fill" />
              {needsReauth ? "Reconnect Google account" : "Connect Google account"}
            </button>
          </ProjectReadOnlyTooltip>
        )
      ) : ready && href ? (
        <a className={buttonClass} href={href}>
          <GoogleLogo aria-hidden size={17} weight="fill" />
          Change Google account or property
        </a>
      ) : (
        <ProjectReadOnlyTooltip className="block">
          <button className={buttonClass} disabled type="button">
            <GoogleLogo aria-hidden size={17} weight="fill" />
            Change Google account or property
          </button>
        </ProjectReadOnlyTooltip>
      )}

      {savedProperty ? (
        <p
          className="m-0 flex items-center gap-2 text-[12.5px] font-semibold text-green"
          role="status"
        >
          <CheckCircle aria-hidden size={16} weight="fill" />
          Connected to {savedProperty}
        </p>
      ) : null}
      {error ? (
        <p className="m-0 text-[12.5px] leading-5 text-red" role="alert">
          {error}
        </p>
      ) : null}
      <GoogleScopes scopes={scopes} />
    </section>
  );
}
