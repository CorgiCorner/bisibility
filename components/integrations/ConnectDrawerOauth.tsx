"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui";
import type {
  GoogleOAuthSetup,
  GooglePropertySaveResult,
  IntegrationProviderData,
} from "@/lib/integrations/types";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { normalizeGa4PropertyId } from "@/lib/providers/analytics/property-id";
import { appPath, asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import { GoogleLogoIcon as GoogleLogo } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConnectDrawerOauthSelection } from "./ConnectDrawerOauthSelection";
import {
  GoogleConnectedSummary,
  GoogleConnectionIntro,
  GoogleSelectionResult,
} from "./ConnectDrawerOauthSummary";

export type ConnectDrawerOauthProps = {
  completePropertySelection?: (input: {
    projectId: string;
    property: string;
  }) => Promise<{ property: string }>;
  loadStoredProperties?: (input: {
    projectId: string;
    provider: "ga4" | "gsc";
  }) => Promise<GoogleOAuthSetup>;
  projectId?: string;
  projectRef?: ProjectRef;
  provider: IntegrationProviderData;
  saveStoredProperty?: (input: {
    projectId: string;
    property: string;
    provider: "ga4" | "gsc";
  }) => Promise<GooglePropertySaveResult>;
  scopes: readonly string[];
};

const oauthButtonSx = {
  gap: "9px",
  minHeight: 40,
  "&:hover": { borderColor: "var(--accent)" },
  "&.Mui-focusVisible": { borderColor: "var(--accent)" },
} as const;

export function ConnectDrawerOauth({
  completePropertySelection,
  loadStoredProperties,
  projectId,
  projectRef,
  provider,
  saveStoredProperty,
  scopes,
}: Readonly<ConnectDrawerOauthProps>) {
  const isGa4 = provider.id === "ga4";
  const isConnected = provider.status === "connected";
  const needsReauth = provider.status === "needs_reauth";
  const [setup, setSetup] = useState<GoogleOAuthSetup | null>(provider.drawer.googleOAuth ?? null);
  const [selectionSource, setSelectionSource] = useState<"pending" | "stored" | null>(
    provider.drawer.googleOAuth ? "pending" : null,
  );
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

  async function loadProperties() {
    if (!loadStoredProperties || !projectId || readOnly) return;
    setError(null);
    setPending(true);
    try {
      const loaded = await loadStoredProperties({
        projectId,
        provider: provider.id as "ga4" | "gsc",
      });
      setSetup(loaded);
      setSelectionSource("stored");
      setProperty(
        loaded.properties.some((option) => option.value === loaded.preferredProperty)
          ? (loaded.preferredProperty ?? "")
          : (loaded.properties[0]?.value ?? ""),
      );
      setManualEntry(false);
    } catch {
      setError("Properties could not be loaded. Try again or reconnect the account.");
    } finally {
      setPending(false);
    }
  }

  async function selectProperty() {
    if (!projectId || !property || readOnly || !selectionSource) return;
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
      const result =
        selectionSource === "stored"
          ? await saveStoredProperty?.({
              projectId,
              property: selectedValue,
              provider: provider.id as "ga4" | "gsc",
            })
          : await completePropertySelection?.({ projectId, property: selectedValue });
      if (!result) throw new Error("Property selection is unavailable.");
      if ("status" in result && result.status === "reauth_required") {
        setSetup({
          error: "Reconnect the Google account to change its property.",
          properties: [],
          provider: provider.id as "ga4" | "gsc",
          requiresReauth: true,
        });
        return;
      }
      if (!("property" in result)) throw new Error("Property selection is unavailable.");
      setSavedProperty(result.property);
      setSetup(null);
      setSelectionSource(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google connection failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[13px] border border-border bg-bg-sunken p-[18px]">
      <GoogleConnectionIntro
        connected={isConnected}
        needsReauth={needsReauth}
        provider={provider}
      />

      {isConnected && !setup ? (
        <GoogleConnectedSummary property={provider.drawer.defaults.login} />
      ) : null}

      {setup ? (
        <ConnectDrawerOauthSelection
          allowManualEntry={selectionSource === "pending" && !setup.requiresReauth}
          isGa4={isGa4}
          manualEntry={manualEntry}
          onManualEntryChange={setManualEntry}
          onPropertyChange={setProperty}
          onPropertyErrorChange={setPropertyError}
          onSelect={() => void selectProperty()}
          pending={pending}
          property={property}
          propertyError={propertyError}
          readOnly={readOnly}
          setup={setup}
        />
      ) : null}

      {!isConnected || setup ? (
        ready && href ? (
          <Button
            fullWidth
            href={href}
            startIcon={<GoogleLogo aria-hidden size={17} weight="fill" />}
            sx={oauthButtonSx}
            variant="secondary"
          >
            {setup
              ? "Use a different Google account"
              : needsReauth
                ? "Reconnect Google account"
                : "Connect Google account"}
          </Button>
        ) : (
          <ProjectReadOnlyTooltip className="block">
            <Button
              disabled
              fullWidth
              startIcon={<GoogleLogo aria-hidden size={17} weight="fill" />}
              sx={oauthButtonSx}
              type="button"
              variant="secondary"
            >
              {needsReauth ? "Reconnect Google account" : "Connect Google account"}
            </Button>
          </ProjectReadOnlyTooltip>
        )
      ) : ready && href && loadStoredProperties ? (
        <div className="flex flex-col gap-2.5">
          <Button
            fullWidth
            loading={pending}
            loadingLabel="Loading properties…"
            onClick={() => void loadProperties()}
            sx={oauthButtonSx}
            type="button"
            variant="secondary"
          >
            Change property
          </Button>
          <Button
            fullWidth
            href={href}
            startIcon={<GoogleLogo aria-hidden size={17} weight="fill" />}
            sx={oauthButtonSx}
            variant="secondary"
          >
            Reconnect account
          </Button>
        </div>
      ) : (
        <ProjectReadOnlyTooltip className="block">
          <Button
            disabled
            fullWidth
            startIcon={<GoogleLogo aria-hidden size={17} weight="fill" />}
            sx={oauthButtonSx}
            type="button"
            variant="secondary"
          >
            Change property
          </Button>
        </ProjectReadOnlyTooltip>
      )}

      <GoogleSelectionResult error={error} savedProperty={savedProperty} scopes={scopes} />
    </section>
  );
}
