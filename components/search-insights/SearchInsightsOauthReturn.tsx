"use client";

import { ActionNotice } from "@/components/integrations/ConnectDrawerControls";
import { ConnectDrawerOauthSelection } from "@/components/integrations/ConnectDrawerOauthSelection";
import type { Notice } from "@/components/integrations/ConnectDrawerSchema";
import { providerActionErrorNotice } from "@/components/integrations/ConnectDrawerSchema";
import { SearchInsightsOauthSelection } from "@/components/search-insights/SearchInsightsOauthSelection";
import { Button, ConfirmModal, ModuleMark } from "@/components/ui";
import type {
  cancelGooglePropertySelection,
  completeGooglePropertySelection,
  disconnectGoogleSearchConsole,
} from "@/lib/actions/providers";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { GoogleLogoIcon as GoogleLogo } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SELECT_FAILED } from "./search-insights-copy";

export type CancelGooglePropertySelectionAction = typeof cancelGooglePropertySelection;
export type CompleteGooglePropertySelectionAction = typeof completeGooglePropertySelection;
export type DisconnectGoogleSearchConsoleAction = typeof disconnectGoogleSearchConsole;

export type SearchInsightsOauthReturnProps = {
  cancelAction: CancelGooglePropertySelectionAction;
  completeAction: CompleteGooglePropertySelectionAction;
  disconnectAction: DisconnectGoogleSearchConsoleAction;
  projectId: string;
  setup: GoogleOAuthSetup;
  syncPlan?: SearchSyncPreflightPlan;
};

/**
 * The consent screen returns to this module rather than to Integrations, so the property
 * choice has to be finishable here. Search Console is the module's own flow; the analytics
 * provider comes back through the same seam and is handed to the same picker.
 */
export function SearchInsightsOauthReturn({
  cancelAction,
  completeAction,
  disconnectAction,
  projectId,
  setup,
  syncPlan,
}: Readonly<SearchInsightsOauthReturnProps>) {
  const router = useRouter();
  const isGa4 = setup.provider === "ga4";
  const [property, setProperty] = useState(
    setup.preferredProperty ?? setup.properties[0]?.value ?? "",
  );
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(
    isGa4 && Boolean(setup.error) && setup.properties.length === 0,
  );
  const [retrying, startRetry] = useTransition();
  const [pending, setPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectFailure, setDisconnectFailure] = useState<Notice | null>(null);
  async function cancel() {
    setCancelling(true);
    try {
      await cancelAction({ projectId });
      router.refresh();
    } finally {
      setCancelling(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await disconnectAction({ projectId });
      setDisconnectFailure(null);
      setDisconnectOpen(false);
      router.refresh();
    } catch (error) {
      setDisconnectFailure(providerActionErrorNotice(error));
      throw error;
    } finally {
      setDisconnecting(false);
    }
  }

  async function select() {
    setPending(true);
    setPropertyError(null);
    try {
      await completeAction({ projectId, property });
      router.refresh();
    } catch (error) {
      setPropertyError(actionErrorMessage(error, SELECT_FAILED));
    } finally {
      setPending(false);
    }
  }

  const switchAccountHref = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: searchConsolePath(asProjectRef(projectId)),
  });

  return (
    <div
      className={isGa4 ? "w-full max-w-[340px]" : "w-full max-w-[676px]"}
      data-testid="search-insights-oauth-return"
    >
      {!isGa4 && syncPlan ? (
        <header className="mx-auto mb-6 flex max-w-[520px] flex-col items-center text-center">
          <ModuleMark
            bordered
            className="mb-4"
            icon={GoogleLogo}
            label="Google logo"
            variant="soft"
          />
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.35px] text-fg">
            Pick the property to read
          </h1>
          <p className="m-0 mt-2.5 text-[13.5px] leading-6 text-fg-muted">
            Search Console reports per property. Choose one, and bisibility imports its history -
            you can change it later without losing what has already been pulled.
          </p>
        </header>
      ) : null}
      {isGa4 ? (
        <ConnectDrawerOauthSelection
          isGa4
          allowManualEntry={isGa4}
          footerAction={
            <Button
              loading={cancelling}
              onClick={() => void cancel()}
              size="xs"
              type="button"
              variant="ghost"
              sx={{ color: "var(--red)", "&:hover": { color: "var(--red)" } }}
            >
              Disconnect
            </Button>
          }
          manualEntry={manualEntry}
          onManualEntryChange={setManualEntry}
          onPropertyChange={setProperty}
          onPropertyErrorChange={setPropertyError}
          onSelect={() => void select()}
          pending={pending}
          property={property}
          propertyError={propertyError}
          readOnly={false}
          retryAction={
            setup.error ? (
              <Button
                loading={retrying}
                loadingLabel="Retrying…"
                onClick={() => startRetry(() => router.refresh())}
                size="xs"
                type="button"
                variant="secondary"
              >
                Retry
              </Button>
            ) : undefined
          }
          setup={setup}
        />
      ) : syncPlan ? (
        <SearchInsightsOauthSelection
          accountEmail={setup.accountEmail}
          onDisconnect={() => {
            setDisconnectFailure(null);
            setDisconnectOpen(true);
          }}
          onPropertyChange={setProperty}
          onPropertyErrorChange={setPropertyError}
          onSelect={() => void select()}
          pending={pending}
          property={property}
          setup={setup}
          switchAccountHref={switchAccountHref}
          syncPlan={syncPlan}
        />
      ) : null}

      <ConfirmModal
        busy={disconnecting}
        failureDetail={disconnectFailure ? <ActionNotice notice={disconnectFailure} /> : undefined}
        kind="removeSearchConsoleConnection"
        onClose={() => setDisconnectOpen(false)}
        onConfirm={disconnect}
        open={disconnectOpen}
      />
    </div>
  );
}
