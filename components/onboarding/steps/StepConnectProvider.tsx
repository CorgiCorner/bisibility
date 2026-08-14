"use client";

import { buildOnboardingStepHref } from "@/components/onboarding/onboarding-fixtures";
import {
  actionErrorMessage,
  feedbackClass,
  onboardingFormId,
} from "@/components/onboarding/onboarding-form-utils";
import { InfoTooltip } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useForm } from "react-hook-form";
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
  savedProviderCompletionInput,
  type TestedCredentialKeyMap,
  withConnectedProvider,
} from "./StepConnectProvider.fields";
import type { StepConnectProviderProps } from "./StepConnectProvider.types";
import { StepConnectProviderCards } from "./StepConnectProviderCards";
import { StepConnectProviderCredentials } from "./StepConnectProviderCredentials";
import { StepConnectProviderSkip } from "./StepConnectProviderSkip";

export type { OnboardingConnectProviderInput } from "./StepConnectProvider.fields";

export function StepConnectProvider({
  analyticsNotice,
  analyticsOption,
  connectProviderAction,
  defaultValues,
  flowState,
  initialConnections,
  onComplete,
  onContinueDisabledChange,
  onSkip,
  testProviderConnectionAction,
}: Readonly<StepConnectProviderProps>) {
  const router = useRouter();
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
  const hasCurrentSuccessfulTest = currentTestResult?.ok === true;
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
    if (typeof window !== "undefined")
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
    const nextValues = savedProviderCompletionInput(values.projectId, providerId);
    if (onComplete) return onComplete(nextValues, nextConnections);
    router.push(
      buildOnboardingStepHref(3, {
        ...flowState,
        providerId,
        projectId: nextValues.projectId,
      }),
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
        const nextDirtyProviders = {
          ...dirtyProviders,
          [values.providerId]: false,
        };
        setConnections(nextConnections);
        setDirtyProviders(nextDirtyProviders);
        setActionError(null);
        updateContinueDisabled(nextConnections, nextDirtyProviders);
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
  function handleProviderSubmit(event: FormEvent<HTMLFormElement>) {
    if (!connectedProvider) return void handleSubmit(onSubmit)(event);
    event.preventDefault();
    void onSubmit(getValues());
  }
  return (
    <form id={onboardingFormId} onSubmit={handleProviderSubmit}>
      <input type="hidden" {...register("projectId")} />
      <input type="hidden" {...register("providerId")} />
      <div className="flex items-start justify-between gap-3">
        <div className="text-lg font-semibold tracking-[-0.4px]">Connect data</div>
        <StepConnectProviderSkip flowState={flowState} getValues={getValues} onSkip={onSkip} />
      </div>
      <StepConnectProviderCards
        analyticsNotice={analyticsNotice}
        connections={connections}
        dirtyProviders={dirtyProviders}
        onSelect={selectProvider}
        selectedProviderId={selectedProviderId}
        testResults={testResults}
      />
      {errors.providerId ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{errors.providerId.message}</p>
      ) : null}
      <StepConnectProviderCredentials
        busy={isSubmitting || testingProviderId !== null}
        saveDisabled={!hasCurrentSuccessfulTest}
        errors={errors}
        onCredentialChange={handleCredentialChange}
        onSave={handleSave}
        onTest={handleTest}
        providerId={selectedProvider.value}
        providerLabel={selectedProvider.label}
        register={register}
        savedConnection={
          Boolean(connections[selectedProvider.value]) && !dirtyProviders[selectedProvider.value]
        }
        testDisabled={testDisabled}
        testResult={currentTestResult}
        testing={testingProviderId === selectedProvider.value}
      />
      {actionError ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{actionError}</p>
      ) : null}
      {analyticsOption ? (
        <div className="mt-[22px]">
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
            Your site&apos;s data / optional, free
            <InfoTooltip text="Search Console shows the queries your site already ranks for. Free import for keyword suggestions; it cannot check rankings." />
          </div>
          <div className="mt-2 grid items-stretch gap-3 sm:grid-cols-2">{analyticsOption}</div>
        </div>
      ) : null}
    </form>
  );
}
