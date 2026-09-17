"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { normalizeGa4PropertyId } from "@/lib/providers/analytics/property-id";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionNotice } from "./ConnectDrawerControls";
import type { ConnectDrawerOauthProps, SearchSyncSelection } from "./ConnectDrawerOauth.types";
import { ConnectDrawerOauthActions } from "./ConnectDrawerOauthActions";
import { ConnectDrawerOauthSelection } from "./ConnectDrawerOauthSelection";
import {
  GoogleConnectedSummary,
  GoogleConnectionIntro,
  GoogleSelectionResult,
} from "./ConnectDrawerOauthSummary";
import { type Notice, providerActionErrorNotice } from "./ConnectDrawerSchema";

export type { ConnectDrawerOauthProps } from "./ConnectDrawerOauth.types";

export function ConnectDrawerOauth({
  completePropertySelection,
  disconnectProvider,
  loadStoredProperties,
  onDisconnected,
  projectId,
  projectRef,
  provider,
  saveStoredProperty,
  scopes,
  syncPlan,
}: Readonly<ConnectDrawerOauthProps>) {
  const t = useTranslations("projectIntegrations.oauth");
  const drawerT = useTranslations("projectIntegrations.drawer");
  const oauthProviderId = provider.id as "ga4" | "gsc";
  const isGa4 = oauthProviderId === "ga4";
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
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectFailure, setDisconnectFailure] = useState<Notice | null>(null);
  const { readOnly } = useProjectWriteMode();
  const router = useRouter();
  const scopedProjectRef = projectRef ?? (projectId ? asProjectRef(projectId) : undefined);
  const returnPath = scopedProjectRef
    ? `${appPath(scopedProjectRef, "integrations")}?connect=${oauthProviderId}`
    : undefined;
  const href =
    projectId && scopedProjectRef
      ? googleInstallUrl({
          projectId,
          provider: oauthProviderId,
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
        provider: oauthProviderId,
      });
      setSetup(loaded);
      setSelectionSource("stored");
      setProperty(
        loaded.properties.some((option) => option.value === loaded.preferredProperty)
          ? (loaded.preferredProperty ?? "")
          : (loaded.properties[0]?.value ?? ""),
      );
      setManualEntry(false);
      setSavedProperty(null);
    } catch {
      setError(t("loadPropertiesError"));
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    if (!projectId || !disconnectProvider || readOnly) return;
    setDisconnecting(true);
    try {
      await disconnectProvider({ projectId, providerId: oauthProviderId });
      setDisconnectFailure(null);
      setDisconnectOpen(false);
      router.refresh();
      onDisconnected?.();
    } catch (cause) {
      setDisconnectFailure(
        providerActionErrorNotice(cause, {
          appUpdateRequired: drawerT("appUpdateRequired"),
          connectionTestFailed: drawerT("connectionTestFailed"),
          connectionTestPassed: drawerT("connectionTestPassed"),
          providerActionFailed: drawerT("providerActionFailed"),
          providerActionFailedMessage: drawerT("providerActionFailedMessage"),
        }),
      );
      throw cause;
    } finally {
      setDisconnecting(false);
    }
  }

  async function selectProperty(selection?: SearchSyncSelection) {
    if (!projectId || readOnly || !selectionSource) return;
    let selectedValue = property;
    if (isGa4) {
      const normalized = normalizeGa4PropertyId(property);
      if (!normalized.ok) {
        setPropertyError(normalized.error.message);
        return;
      }
      selectedValue = normalized.value;
      setProperty(selectedValue);
    } else if (!property) {
      return;
    }
    setError(null);
    setPropertyError(null);
    setPending(true);
    const gscSelection = isGa4 ? {} : selection;
    try {
      const result =
        selectionSource === "stored"
          ? await saveStoredProperty?.({
              ...gscSelection,
              projectId,
              property: selectedValue,
              provider: oauthProviderId,
            })
          : await completePropertySelection?.({
              ...gscSelection,
              projectId,
              property: selectedValue,
            });
      if (!result) throw new Error(t("propertySelectionUnavailable"));
      if ("status" in result && result.status === "reauth_required") {
        setSetup({
          error: t("reconnectToChangeProperty"),
          properties: [],
          provider: oauthProviderId,
          requiresReauth: true,
        });
        return;
      }
      if (!("property" in result)) throw new Error(t("propertySelectionUnavailable"));
      setSavedProperty(result.property);
      setSetup(null);
      setSelectionSource(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("connectionFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-bg-sunken p-4.5">
      <GoogleConnectionIntro
        connected={isConnected}
        needsReauth={needsReauth}
        provider={provider}
        selecting={Boolean(setup)}
      />

      {isConnected && !setup ? (
        <GoogleConnectedSummary
          property={savedProperty ?? provider.drawer.defaults.login}
          providerId={provider.id}
        />
      ) : null}

      {setup ? (
        isGa4 ? (
          <ConnectDrawerOauthSelection
            allowManualEntry={selectionSource === "pending" && !setup.requiresReauth}
            isGa4
            manualEntry={manualEntry}
            onManualEntryChange={setManualEntry}
            onCancel={() => {
              setSetup(null);
              setSelectionSource(null);
              setError(null);
            }}
            onPropertyChange={setProperty}
            onPropertyErrorChange={setPropertyError}
            onSelect={() => void selectProperty()}
            pending={pending}
            property={property}
            propertyError={propertyError}
            readOnly={readOnly}
            setup={setup}
          />
        ) : syncPlan ? (
          <ConnectDrawerOauthSelection
            allowManualEntry={selectionSource === "pending" && !setup.requiresReauth}
            isGa4={false}
            manualEntry={manualEntry}
            onManualEntryChange={setManualEntry}
            onCancel={() => {
              setSetup(null);
              setSelectionSource(null);
              setError(null);
            }}
            onPropertyChange={setProperty}
            onPropertyErrorChange={setPropertyError}
            onSelect={(selection) => void selectProperty(selection)}
            pending={pending}
            property={property}
            propertyError={propertyError}
            readOnly={readOnly}
            setup={setup}
            syncPlan={syncPlan}
          />
        ) : null
      ) : null}

      <ConnectDrawerOauthActions
        accountEmail={provider.drawer.accountEmail}
        disconnectDisabled={!disconnectProvider || readOnly}
        href={href}
        isConnected={isConnected}
        loadStoredProperties={loadStoredProperties ? () => void loadProperties() : undefined}
        needsReauth={needsReauth}
        onDisconnect={() => {
          setDisconnectFailure(null);
          setDisconnectOpen(true);
        }}
        pending={pending}
        ready={ready}
        setupActive={Boolean(setup)}
      />
      <ConfirmModal
        busy={disconnecting}
        failureDetail={disconnectFailure ? <ActionNotice notice={disconnectFailure} /> : undefined}
        kind="removeIntegration"
        onClose={() => setDisconnectOpen(false)}
        onConfirm={disconnect}
        open={disconnectOpen}
      />

      <GoogleSelectionResult
        connected={isConnected || Boolean(savedProperty)}
        error={error}
        savedProperty={savedProperty}
        scopes={scopes}
      />
    </section>
  );
}
