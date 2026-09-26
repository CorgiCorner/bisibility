"use client";

import { demoActions, serverActions } from "@/components/integrations/ConnectDrawerActions";
import {
  ActionNotice,
  ActivityList,
  ConnectionOkBanner,
  CredentialFields,
} from "@/components/integrations/ConnectDrawerControls";
import { ConnectDrawerFooter } from "@/components/integrations/ConnectDrawerFooter";
import { ConnectDrawerOauth } from "@/components/integrations/ConnectDrawerOauth";
import {
  type ConnectFormValues,
  connectInput,
  drawerFormSchema,
  type Notice,
  type PendingAction,
  providerActionErrorNotice,
  testInput,
  testNotice,
} from "@/components/integrations/ConnectDrawerSchema";
import { ProviderRates } from "@/components/integrations/ProviderRates";
import {
  oauthScopes,
  providerAuthMode,
  providerCredentialFields,
  providerMode,
  testSuccessPresentation,
} from "@/components/integrations/provider-auth";
import {
  credentialFieldsSignature,
  hasRequiredCredentialFields,
} from "@/components/integrations/provider-credentials";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Sheet } from "@/components/ui/Sheet";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type {
  IntegrationProviderData,
  ProviderActionHandlers,
  ProviderTestResult,
} from "@/lib/integrations/types";
import type { ProjectRef } from "@/lib/routing/app-path";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

export type ConnectDrawerProps = {
  actions?: ProviderActionHandlers;
  deploymentMode?: "cloud" | "self-host";
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projectRef?: ProjectRef;
  provider: IntegrationProviderData;
  searchSyncPlan?: SearchSyncPreflightPlan;
};

function drawerNoticeCopy(t: ReturnType<typeof useTranslations>) {
  return {
    appUpdateRequired: t("appUpdateRequired"),
    connectionTestFailed: t("connectionTestFailed"),
    connectionTestPassed: t("connectionTestPassed"),
    providerActionFailed: t("providerActionFailed"),
    providerActionFailedMessage: t("providerActionFailedMessage"),
  };
}

export function ConnectDrawer({
  actions,
  deploymentMode = "self-host",
  open,
  onClose,
  projectId = "prj_storybook",
  projectRef,
  provider,
  searchSyncPlan,
}: Readonly<ConnectDrawerProps>) {
  const t = useTranslations("projectIntegrations.drawer");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [testedCredentialSignature, setTestedCredentialSignature] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [testState, setTestState] = useState<"idle" | "ok" | "testing">("idle");
  const successPresentation = testSuccessPresentation(provider.id, testResult);
  const successMessage =
    successPresentation.kind === "verified"
      ? t("connectionVerified")
      : successPresentation.kind === "application_connection"
        ? t("connectionVerifiedWithDetail", { detail: successPresentation.message ?? "" })
        : (successPresentation.message ?? "");
  const testSuccessMessage =
    successPresentation.balance?.kind === "currency"
      ? t("testResultBalance", {
          balance: successPresentation.balance.value,
          message: successMessage,
        })
      : successPresentation.balance?.kind === "searches"
        ? t("testResultSearches", {
            count: successPresentation.balance.value,
            message: successMessage,
          })
        : successMessage;
  const { readOnly } = useProjectWriteMode();
  const formId = `connect-${provider.id}`;
  const mode = providerMode(provider);
  const authMode = providerAuthMode(provider);
  const activeActions = actions ?? (projectId === "prj_storybook" ? demoActions : serverActions);
  const formDefaults = {
    endpoint: provider.drawer.defaults.endpoint,
    login: provider.drawer.defaults.login,
    projectId,
    providerId: provider.id as ConnectFormValues["providerId"],
    secret: provider.drawer.defaults.secret,
  };
  const form = useForm<ConnectFormValues>({
    defaultValues: formDefaults,
    resolver: zodResolver(drawerFormSchema),
  });
  const errors = form.formState.errors;
  const busy = pendingAction !== null;
  const isManage = mode === "manage";
  const credentialFields = providerCredentialFields(provider);
  const [initialCredentialSignature, setInitialCredentialSignature] = useState(() =>
    credentialFieldsSignature(credentialFields, formDefaults),
  );
  const formValues = form.watch();
  const currentCredentialSignature = credentialFieldsSignature(credentialFields, formValues);
  const credentialFieldsChanged = currentCredentialSignature !== initialCredentialSignature;
  const requiresSuccessfulTest =
    authMode === "key" &&
    (provider.credentialSource === "hosted" || !isManage || credentialFieldsChanged);
  const hasCurrentSuccessfulTest =
    !requiresSuccessfulTest ||
    (testState === "ok" && testedCredentialSignature === currentCredentialSignature);
  // Blank fields on a connected provider fall back to the stored credentials
  // server-side, so only the initial connect requires every field locally.
  const missingTestCredentials =
    requiresSuccessfulTest &&
    (!isManage || provider.credentialSource === "hosted") &&
    !hasRequiredCredentialFields(credentialFields, formValues);
  let displayedTestState: "idle" | "ok" | "testing" = "idle";
  if (pendingAction === "test") displayedTestState = "testing";
  else if (requiresSuccessfulTest && hasCurrentSuccessfulTest) displayedTestState = "ok";
  const saveDisabled =
    requiresSuccessfulTest && (!hasCurrentSuccessfulTest || missingTestCredentials);

  async function runAction(action: PendingAction, work: () => Promise<Notice | null>) {
    if (readOnly) {
      return;
    }
    setPendingAction(action);
    setNotice(null);
    try {
      setNotice(await work());
    } catch (error) {
      setNotice(providerActionErrorNotice(error, drawerNoticeCopy(t)));
    } finally {
      setPendingAction(null);
    }
  }

  const handleSave = form.handleSubmit((values) =>
    runAction("save", async () => {
      if (saveDisabled) {
        return {
          message: t("testRequiredMessage"),
          ok: false,
          title: t("testRequiredTitle"),
        };
      }
      await activeActions.connectProvider(
        connectInput(values, {
          expectedConnectionId: provider.connectionId ?? null,
          expectedConnectionUpdatedAt: provider.connectionUpdatedAt ?? null,
          expectedCredentialSource: provider.credentialSource ?? "own",
        }),
      );
      const savedValues = { ...values, secret: "" };
      form.reset(savedValues);
      setInitialCredentialSignature(credentialFieldsSignature(credentialFields, savedValues));
      setTestedCredentialSignature(null);
      setTestResult(null);
      setTestState("idle");
      onClose();
      return null;
    }),
  );

  function handleTest() {
    if (readOnly) {
      return;
    }
    form
      .handleSubmit(async (values) => {
        setPendingAction("test");
        setNotice(null);
        setTestResult(null);
        setTestState("testing");
        try {
          const result = await activeActions.testProviderConnection(testInput(values));
          if (result.ok) {
            setTestedCredentialSignature(credentialFieldsSignature(credentialFields, values));
            setTestResult(result);
            setTestState("ok");
            return;
          }
          setTestedCredentialSignature(null);
          setNotice(testNotice(result, drawerNoticeCopy(t)));
          setTestState("idle");
        } catch (error) {
          setTestedCredentialSignature(null);
          setNotice(providerActionErrorNotice(error, drawerNoticeCopy(t)));
          setTestState("idle");
        } finally {
          setPendingAction(null);
        }
      })()
      .catch((error) => setNotice(providerActionErrorNotice(error, drawerNoticeCopy(t))));
  }

  const footer =
    authMode === "oauth" && !isManage ? undefined : (
      <ConnectDrawerFooter
        busy={busy}
        formId={formId}
        isManage={isManage}
        oauthOnly={authMode === "oauth"}
        onTest={handleTest}
        pendingAction={pendingAction}
        saveDisabled={saveDisabled}
        testDisabled={missingTestCredentials}
        testState={displayedTestState}
      />
    );

  const titleCopy =
    authMode === "oauth"
      ? deploymentMode === "cloud"
        ? t("oauthTitleCloud")
        : t("oauthTitleSelfHost")
      : t("keyTitle");

  const title = (
    <span className="block">
      <span className="block truncate">{provider.name}</span>
      <span className="mt-[3px] block text-[13px] font-normal leading-normal tracking-normal text-fg-muted">
        {titleCopy}
      </span>
    </span>
  );

  return (
    <Sheet footer={footer} onClose={onClose} open={open} title={title}>
      <form className="flex flex-col gap-5" id={formId} onSubmit={handleSave}>
        <input type="hidden" {...form.register("projectId")} />
        <input type="hidden" {...form.register("providerId")} />
        {authMode === "oauth" ? (
          <ConnectDrawerOauth
            completePropertySelection={activeActions.completeGooglePropertySelection}
            disconnectProvider={activeActions.disconnectProvider}
            loadStoredProperties={activeActions.loadStoredGoogleProperties}
            onDisconnected={onClose}
            projectId={projectId}
            projectRef={projectRef}
            provider={provider}
            saveStoredProperty={activeActions.saveStoredGoogleProperty}
            scopes={oauthScopes(provider)}
            syncPlan={provider.id === "gsc" ? searchSyncPlan : undefined}
          />
        ) : (
          <>
            <CredentialFields errors={errors} form={form} provider={provider} />
            {notice ? <ActionNotice notice={notice} /> : null}
          </>
        )}
        {requiresSuccessfulTest && hasCurrentSuccessfulTest && testState === "ok" ? (
          <ConnectionOkBanner message={testSuccessMessage} />
        ) : null}
        {provider.kind === "serp" && provider.drawer.rates ? (
          <ProviderRates
            connected={isManage}
            projectId={projectId}
            providerId={provider.id}
            rates={provider.drawer.rates}
            readOnlyRates={provider.credentialSource === "hosted"}
            updateRate={activeActions.updateProviderRate}
          />
        ) : null}
        {provider.kind === "serp" ? <ActivityList provider={provider} /> : null}
        {authMode === "oauth" && notice ? <ActionNotice notice={notice} /> : null}
      </form>
    </Sheet>
  );
}
