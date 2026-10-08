"use client";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEventHandler, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { completeProviderSelection } from "./complete-provider-selection";
import {
  type ConnectedProviderMap,
  currentProviderState,
  formDefaults,
  initialDrafts,
  type OnboardingConnectProviderInput,
  type OnboardingSerpProviderId,
  onboardingConnectProviderSchemaForConnections,
  type PendingProviderCompletion,
  type ProviderDraftMap,
  type ProviderTestResultMap,
  providerConnectInput,
  providerCredentialKey,
  providerOptions,
  providerSelectionState,
  providerTestInput,
  replaceSelectedProviderInUrl,
  type TestedCredentialKeyMap,
  withConnectedProvider,
} from "./StepConnectProvider.fields";
import type { StepConnectProviderProps } from "./StepConnectProvider.types";
import { StepConnectProviderContent } from "./StepConnectProviderContent";
import { StepConnectProviderLayout } from "./StepConnectProviderLayout";
import { providerActionError, providerLabel } from "./step-connect-provider-copy";

export type { OnboardingConnectProviderInput } from "./StepConnectProvider.fields";

export function StepConnectProvider({
  analyticsNotice,
  analyticsOption,
  connectProviderAction,
  defaultValues,
  flowState,
  initialConnections,
  mode = "step",
  modalOpen,
  onComplete,
  onModalClose,
  onModalExited,
  onContinueDisabledChange,
  testProviderConnectionAction,
}: Readonly<StepConnectProviderProps>) {
  const t = useTranslations("onboarding.provider");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const pendingModalCompletion = useRef<PendingProviderCompletion | null>(null);
  const defaults = formDefaults(defaultValues, flowState);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectedProviderMap>(initialConnections ?? {});
  const [drafts, setDrafts] = useState<ProviderDraftMap>(() => initialDrafts(defaults));
  const [testingProviderId, setTestingProviderId] = useState<OnboardingSerpProviderId | null>(null);
  const [testResults, setTestResults] = useState<ProviderTestResultMap>({});
  const [testedCredentialKeys, setTestedCredentialKeys] = useState<TestedCredentialKeyMap>({});
  const [dirtyProviders, setDirtyProviders] = useState<
    Partial<Record<OnboardingSerpProviderId, boolean>>
  >({});
  const {
    clearErrors,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<OnboardingConnectProviderInput>({
    defaultValues: defaults,
    resolver: zodResolver(
      onboardingConnectProviderSchemaForConnections(connections, {
        costPrecision: t("errors.costPrecision"),
        credentialTooLong: t("errors.credentialTooLong", { maximum: 500 }),
        loginRequired: t("errors.loginRequired"),
        secretRequired: t("errors.secretRequired"),
      }),
    ),
  });
  const selectedProviderId = watch("providerId") ?? defaults.providerId;
  const credentialValues = {
    credentials: watch("credentials"),
    login: watch("login"),
    secret: watch("secret"),
  };
  const selectedProvider =
    providerOptions.find(({ value }) => value === selectedProviderId) ?? providerOptions[0];
  const selectedProviderLabel = providerLabel(t, selectedProvider.value);
  const { testDisabled, testResult: currentTestResult } = currentProviderState(
    selectedProvider.value,
    credentialValues,
    testResults,
    testedCredentialKeys,
  );
  const connectedProvider = providerOptions.find(
    ({ value }) => connections[value] && !dirtyProviders[value],
  )?.value;
  function updateContinueDisabled(connectionsMap = connections, dirtyMap = dirtyProviders) {
    onContinueDisabledChange?.(
      !providerOptions.some(({ value }) => connectionsMap[value] && !dirtyMap[value]),
    );
  }
  function clearProviderFeedback(providerId = selectedProviderId, dirtyMap = dirtyProviders) {
    const nextTestResults = { ...testResults, [providerId]: null };
    const nextTestedCredentialKeys = {
      ...testedCredentialKeys,
      [providerId]: undefined,
    };
    setActionError(null);
    setTestResults(nextTestResults);
    setTestedCredentialKeys(nextTestedCredentialKeys);
    updateContinueDisabled(connections, dirtyMap);
  }
  function handleCredentialChange() {
    const nextDirtyProviders = connections[selectedProviderId]
      ? { ...dirtyProviders, [selectedProviderId]: true }
      : dirtyProviders;
    if (connections[selectedProviderId]) setDirtyProviders(nextDirtyProviders);
    clearProviderFeedback(selectedProviderId, nextDirtyProviders);
  }
  function selectProvider(providerId: OnboardingSerpProviderId) {
    const values = getValues();
    const selection = providerSelectionState(values, providerId, drafts);
    const { drafts: nextDrafts, values: nextValues } = selection;
    setDrafts(nextDrafts);
    setValue("providerId", providerId);
    setValue("login", nextValues.login ?? "");
    setValue("secret", nextValues.secret ?? "");
    setValue("costPerCheck", nextValues.costPerCheck);
    clearErrors();
    setActionError(null);
    updateContinueDisabled();
    if (mode === "step" && typeof window !== "undefined")
      replaceSelectedProviderInUrl(flowState, values.projectId, providerId);
  }
  async function runTest(values: OnboardingConnectProviderInput) {
    if (!testProviderConnectionAction) return null;
    setTestingProviderId(values.providerId);
    try {
      const result = await testProviderConnectionAction(providerTestInput(values));
      const nextTestResults = { ...testResults, [values.providerId]: result };
      const nextTestedCredentialKeys = {
        ...testedCredentialKeys,
        [values.providerId]: providerCredentialKey(values.providerId, values),
      };
      setTestResults(nextTestResults);
      setTestedCredentialKeys(nextTestedCredentialKeys);
      updateContinueDisabled();
      return result;
    } finally {
      setTestingProviderId(null);
    }
  }
  function continueToNext(
    providerId: OnboardingSerpProviderId,
    values = getValues(),
    nextConnections = connections,
  ) {
    completeProviderSelection(
      providerId,
      values,
      nextConnections,
      flowState,
      onComplete,
      router.push,
    );
  }
  function completeHostedDataSource() {
    const nextConnections = withConnectedProvider(connections, "dataforseo", undefined);
    const nextDirtyProviders = { ...dirtyProviders, dataforseo: false };
    setValue("providerId", "dataforseo");
    setConnections(nextConnections);
    setDirtyProviders(nextDirtyProviders);
    setActionError(null);
    updateContinueDisabled(nextConnections, nextDirtyProviders);
  }
  function handleTest() {
    handleSubmit(async (values) => {
      setActionError(null);
      try {
        await runTest(values);
      } catch (error) {
        updateContinueDisabled();
        setActionError(providerActionError(error, sharedErrors, t("errors.test")));
      }
    })().catch((error) => {
      updateContinueDisabled();
      setActionError(providerActionError(error, sharedErrors, t("errors.test")));
    });
  }
  function handleSave() {
    handleSubmit(async (values) => {
      try {
        const result = testResults[values.providerId];
        if (
          !result?.ok ||
          testedCredentialKeys[values.providerId] !==
            providerCredentialKey(values.providerId, values)
        ) {
          setActionError(t("errors.testBeforeConnect", { provider: selectedProviderLabel }));
          updateContinueDisabled();
          return;
        }
        await connectProviderAction?.(providerConnectInput(values));
        const nextConnections = withConnectedProvider(
          connections,
          values.providerId,
          result.balance,
        );
        const nextDirtyProviders = { ...dirtyProviders, [values.providerId]: false };
        setConnections(nextConnections);
        setDirtyProviders(nextDirtyProviders);
        setActionError(null);
        updateContinueDisabled(nextConnections, nextDirtyProviders);
        if (mode === "modal") {
          pendingModalCompletion.current = {
            connections: nextConnections,
            providerId: values.providerId,
            values,
          };
          onModalClose?.();
        }
      } catch (error) {
        updateContinueDisabled();
        setActionError(providerActionError(error, sharedErrors, t("errors.save")));
      }
    })().catch((error) => {
      updateContinueDisabled();
      setActionError(providerActionError(error, sharedErrors, t("errors.save")));
    });
  }
  async function onSubmit(values: OnboardingConnectProviderInput) {
    setActionError(null);
    const selectedConnection =
      connections[values.providerId] && !dirtyProviders[values.providerId]
        ? values.providerId
        : null;
    const providerId = selectedConnection ?? connectedProvider;
    if (providerId) return continueToNext(providerId, values);
    setActionError(t("errors.saveBeforeContinue"));
    updateContinueDisabled();
  }
  const handleProviderSubmit: FormEventHandler<HTMLFormElement> = connectedProvider
    ? (event) => {
        event.preventDefault();
        void onSubmit(getValues());
      }
    : handleSubmit(onSubmit);
  const editor = (
    <StepConnectProviderContent
      actionError={actionError}
      analyticsNotice={analyticsNotice}
      analyticsOption={analyticsOption}
      busy={isSubmitting || testingProviderId !== null}
      connections={connections}
      currentTestResult={currentTestResult}
      dirtyProviders={dirtyProviders}
      errors={errors}
      mode={mode}
      onCredentialChange={handleCredentialChange}
      onDataSourceConnected={completeHostedDataSource}
      onSave={handleSave}
      onSelect={selectProvider}
      onTest={handleTest}
      providerError={errors.providerId?.message}
      providerId={selectedProvider.value}
      providerLabel={selectedProviderLabel}
      projectId={getValues("projectId")}
      register={register}
      saveDisabled={currentTestResult?.ok !== true}
      selectedProviderId={selectedProviderId}
      testDisabled={testDisabled}
      testing={testingProviderId === selectedProvider.value}
      testResults={testResults}
    />
  );
  function handleModalExited() {
    const pending = pendingModalCompletion.current;
    pendingModalCompletion.current = null;
    if (pending) continueToNext(pending.providerId, pending.values, pending.connections);
    else onModalExited?.();
  }
  return (
    <StepConnectProviderLayout
      busy={isSubmitting}
      disabled={isSubmitting || testingProviderId !== null || currentTestResult?.ok !== true}
      editor={editor}
      mode={mode}
      onCancel={onModalClose}
      onExited={handleModalExited}
      onSave={handleSave}
      onSubmit={handleProviderSubmit}
      open={modalOpen}
    />
  );
}
