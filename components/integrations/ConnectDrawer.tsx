"use client";

import { demoActions, serverActions } from "@/components/integrations/ConnectDrawerActions";
import {
  ActionNotice,
  ActivityList,
  ConnectionOkBanner,
  CredentialFields,
  EnvHint,
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
  testSuccessCopy,
} from "@/components/integrations/provider-auth";
import {
  credentialFieldsSignature,
  hasRequiredCredentialFields,
} from "@/components/integrations/provider-credentials";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { ConfirmModal, Sheet } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type {
  IntegrationProviderData,
  ProviderActionHandlers,
  ProviderTestResult,
} from "@/lib/integrations/types";
import type { ProjectRef } from "@/lib/routing/app-path";
import { useState } from "react";
import { useForm } from "react-hook-form";

export type ConnectDrawerProps = {
  actions?: ProviderActionHandlers;
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projectRef?: ProjectRef;
  provider: IntegrationProviderData;
};

export function ConnectDrawer({
  actions,
  open,
  onClose,
  projectId = "prj_storybook",
  projectRef,
  provider,
}: Readonly<ConnectDrawerProps>) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [testedCredentialSignature, setTestedCredentialSignature] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [testState, setTestState] = useState<"idle" | "ok" | "testing">("idle");
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
  const requiresSuccessfulTest = authMode === "key" && (!isManage || credentialFieldsChanged);
  const hasCurrentSuccessfulTest =
    !requiresSuccessfulTest ||
    (testState === "ok" && testedCredentialSignature === currentCredentialSignature);
  // Blank fields on a connected provider fall back to the stored credentials
  // server-side, so only the initial connect requires every field locally.
  const missingTestCredentials =
    requiresSuccessfulTest &&
    !isManage &&
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
      setNotice(providerActionErrorNotice(error));
    } finally {
      setPendingAction(null);
    }
  }

  const handleSave = form.handleSubmit((values) =>
    runAction("save", async () => {
      if (saveDisabled) {
        return {
          message: "Test connection before saving.",
          ok: false,
          title: "Connection test required",
        };
      }
      await activeActions.connectProvider(connectInput(values));
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
          setNotice(testNotice(result));
          setTestState("idle");
        } catch (error) {
          setTestedCredentialSignature(null);
          setNotice(providerActionErrorNotice(error));
          setTestState("idle");
        } finally {
          setPendingAction(null);
        }
      })()
      .catch((error) => setNotice(providerActionErrorNotice(error)));
  }

  async function handleDisconnectConfirm() {
    if (readOnly) {
      return;
    }
    setPendingAction("disconnect");
    setNotice(null);
    try {
      await activeActions.disconnectProvider?.({
        projectId,
        providerId: provider.id as ConnectFormValues["providerId"],
      });
      setConfirmOpen(false);
      onClose();
    } catch (error) {
      setNotice(providerActionErrorNotice(error));
      setConfirmOpen(false);
    } finally {
      setPendingAction(null);
    }
  }

  const footer =
    authMode === "oauth" && !isManage ? undefined : (
      <ConnectDrawerFooter
        busy={busy}
        formId={formId}
        isManage={isManage}
        oauthOnly={authMode === "oauth"}
        onDisconnect={() => setConfirmOpen(true)}
        onTest={handleTest}
        pendingAction={pendingAction}
        saveDisabled={saveDisabled}
        testDisabled={missingTestCredentials}
        testState={displayedTestState}
      />
    );

  const title = (
    <span className="block">
      <span className="block truncate">{provider.name}</span>
      <span className="mt-[3px] block text-[13px] font-normal leading-normal tracking-normal text-fg-muted">
        Use your own provider account. Credentials are stored encrypted in your instance.
      </span>
    </span>
  );

  return (
    <>
      <Sheet footer={footer} onClose={onClose} open={open} title={title}>
        <form className="flex flex-col gap-5" id={formId} onSubmit={handleSave}>
          <input type="hidden" {...form.register("projectId")} />
          <input type="hidden" {...form.register("providerId")} />
          {authMode === "oauth" ? (
            <ConnectDrawerOauth
              completePropertySelection={activeActions.completeGooglePropertySelection}
              projectId={projectId}
              projectRef={projectRef}
              provider={provider}
              scopes={oauthScopes(provider)}
            />
          ) : (
            <CredentialFields errors={errors} form={form} provider={provider} />
          )}
          {requiresSuccessfulTest && hasCurrentSuccessfulTest && testState === "ok" ? (
            <ConnectionOkBanner message={testSuccessCopy(provider.id, testResult)} />
          ) : null}
          {provider.kind === "serp" && provider.drawer.rates ? (
            <ProviderRates
              connected={isManage}
              projectId={projectId}
              providerId={provider.id}
              rates={provider.drawer.rates}
              updateRate={activeActions.updateProviderRate}
            />
          ) : null}
          <ActivityList provider={provider} />
          {authMode === "key" ? <EnvHint provider={provider} /> : null}
          {notice ? <ActionNotice notice={notice} /> : null}
        </form>
      </Sheet>
      <ConfirmModal
        busy={pendingAction === "disconnect"}
        kind="removeIntegration"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          handleDisconnectConfirm().catch((error) => setNotice(providerActionErrorNotice(error)));
        }}
        open={confirmOpen}
      />
    </>
  );
}
