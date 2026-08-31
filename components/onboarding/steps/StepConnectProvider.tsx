"use client";
import { actionErrorMessage } from "@/components/onboarding/onboarding-form-utils";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useRouter } from "next/navigation";
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
import { StepConnectProviderCards } from "./StepConnectProviderCards";
import { StepConnectProviderCredentials } from "./StepConnectProviderCredentials";
import { StepConnectProviderLayout } from "./StepConnectProviderLayout";
import { StepConnectProviderView } from "./StepConnectProviderView";

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
  const router = useRouter();
  const pendingModalCompletion = useRef<{
    connections: ConnectedProviderMap;
    providerId: OnboardingSerpProviderId;
    values: OnboardingConnectProviderInput;
  } | null>(null);
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
    resolver: zodResolver(onboardingConnectProviderSchemaForConnections(connections)),
  });
  const selectedProviderId = watch("providerId") ?? defaults.providerId;
  const credentialValues = {
    credentials: watch("credentials"),
    login: watch("login"),
    secret: watch("secret"),
  };
  const selectedProvider =
    providerOptions.find((provider) => provider.value === selectedProviderId) ?? providerOptions[0];
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
  function handleTest() {
    handleSubmit(async (values) => {
      setActionError(null);
      try {
        await runTest(values);
      } catch (error) {
        updateContinueDisabled();
        setActionError(actionErrorMessage(error));
      }
    })().catch((error) => {
      updateContinueDisabled();
      setActionError(actionErrorMessage(error));
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
          setActionError(`Test ${selectedProvider.label} before connecting it.`);
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
        setActionError(actionErrorMessage(error));
      }
    })().catch((error) => {
      updateContinueDisabled();
      setActionError(actionErrorMessage(error));
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
    setActionError("Save a provider before continuing.");
    updateContinueDisabled();
  }
  const handleProviderSubmit: FormEventHandler<HTMLFormElement> = connectedProvider
    ? (event) => {
        event.preventDefault();
        void onSubmit(getValues());
      }
    : handleSubmit(onSubmit);
  const editor = (
    <StepConnectProviderView
      actionError={actionError}
      analyticsNotice={analyticsNotice}
      analyticsOption={analyticsOption}
      cards={
        <StepConnectProviderCards
          connections={connections}
          dirtyProviders={dirtyProviders}
          onSelect={selectProvider}
          selectedProviderId={selectedProviderId}
          testResults={testResults}
        />
      }
      credentials={
        <StepConnectProviderCredentials
          busy={isSubmitting || testingProviderId !== null}
          errors={errors}
          onCredentialChange={handleCredentialChange}
          onSave={handleSave}
          onTest={handleTest}
          providerId={selectedProvider.value}
          providerLabel={selectedProvider.label}
          register={register}
          saveDisabled={currentTestResult?.ok !== true}
          savedConnection={
            Boolean(connections[selectedProvider.value]) && !dirtyProviders[selectedProvider.value]
          }
          showSave={mode === "step"}
          testDisabled={testDisabled}
          testResult={currentTestResult}
          testing={testingProviderId === selectedProvider.value}
        />
      }
      hidden={
        <>
          <input type="hidden" {...register("projectId")} />
          <input type="hidden" {...register("providerId")} />
        </>
      }
      providerError={errors.providerId?.message}
      showHeading={mode === "step"}
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
      label={selectedProvider.label}
      mode={mode}
      onCancel={onModalClose}
      onExited={handleModalExited}
      onSave={handleSave}
      onSubmit={handleProviderSubmit}
      open={modalOpen}
    />
  );
}
