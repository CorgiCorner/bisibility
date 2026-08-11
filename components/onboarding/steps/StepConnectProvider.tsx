"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import {
  actionErrorMessage,
  feedbackClass,
  onboardingFormId,
} from "@/components/onboarding/onboarding-form-utils";
import { OWN_PROVIDER_KEY_COST_EXPLANATION } from "@/lib/cost-estimate/provider-cost-copy";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { TestProviderConnectionInput } from "@/lib/schemas/provider";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useForm } from "react-hook-form";
import {
  anyProviderVerified,
  type ConnectedProviderMap,
  currentProviderState,
  formDefaults,
  initialDrafts,
  type OnboardingConnectProviderInput,
  type OnboardingSerpProviderId,
  onboardingConnectProviderSchemaForConnections,
  type ProviderDraftMap,
  type ProviderTestResult,
  type ProviderTestResultMap,
  primaryProvider,
  providerConnectInput,
  providerCredentialKey,
  providerOptions,
  providerSelectionState,
  providerTestInput,
  providerValuesFromDraft,
  replaceSelectedProviderInUrl,
  type TestedCredentialKeyMap,
  verifiedProviderId,
  withConnectedProvider,
} from "./StepConnectProvider.fields";
import { StepConnectProviderCards } from "./StepConnectProviderCards";
import { StepConnectProviderCredentials } from "./StepConnectProviderCredentials";
import { StepConnectProviderSkip } from "./StepConnectProviderSkip";

export type { OnboardingConnectProviderInput } from "./StepConnectProvider.fields";

type StepConnectProviderProps = {
  connectProviderAction?: (input: OnboardingConnectProviderInput) => Promise<unknown>;
  defaultValues?: OnboardingConnectProviderInput;
  flowState?: OnboardingFlowState;
  initialConnections?: ConnectedProviderMap;
  onComplete?: (values: OnboardingConnectProviderInput) => void;
  onContinueDisabledChange?: (disabled: boolean) => void;
  onSkip?: (values: OnboardingConnectProviderInput) => void;
  testProviderConnectionAction?: (
    input: TestProviderConnectionInput,
  ) => Promise<ProviderTestResult>;
};
export function StepConnectProvider({
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
  const primaryProviderId = primaryProvider(connections);
  const connectedProvider = providerOptions.find(({ value }) => connections[value])?.value;
  function updateContinueDisabled(
    values = getValues(),
    results = testResults,
    keys = testedCredentialKeys,
    connectionsMap = connections,
    draftsMap = drafts,
  ) {
    onContinueDisabledChange?.(
      !anyProviderVerified(connectionsMap, draftsMap, results, keys, values),
    );
  }
  function clearProviderFeedback(providerId = selectedProviderId) {
    const nextTestResults = { ...testResults, [providerId]: null };
    const nextTestedCredentialKeys = { ...testedCredentialKeys, [providerId]: undefined };
    setActionError(null);
    setTestResults(nextTestResults);
    setTestedCredentialKeys(nextTestedCredentialKeys);
    updateContinueDisabled(getValues(), nextTestResults, nextTestedCredentialKeys);
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
    updateContinueDisabled(nextValues, testResults, testedCredentialKeys, connections, nextDrafts);
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
      updateContinueDisabled(values, nextTestResults, nextTestedCredentialKeys);
      return result;
    } finally {
      setTestingProviderId(null);
    }
  }
  function continueToNext(providerId: OnboardingSerpProviderId, values = getValues()) {
    const nextValues = { ...values, providerId };
    if (onComplete) return onComplete(nextValues);
    router.push(
      buildOnboardingStepHref(4, { ...flowState, providerId, projectId: nextValues.projectId }),
    );
  }
  function handleTest() {
    handleSubmit(async (values) => {
      setActionError(null);
      try {
        await runTest(values);
      } catch (error) {
        updateContinueDisabled(values);
        setActionError(actionErrorMessage(error));
      }
    })().catch((error) => {
      updateContinueDisabled();
      setActionError(actionErrorMessage(error));
    });
  }
  function handleFallbackConnect() {
    handleSubmit(async (values) => {
      if (!connectProviderAction || !primaryProviderId || values.providerId === primaryProviderId) {
        return;
      }
      clearProviderFeedback(values.providerId);
      try {
        const result = testResults[values.providerId];
        if (
          !result?.ok ||
          testedCredentialKeys[values.providerId] !==
            providerCredentialKey(values.providerId, values)
        ) {
          setActionError("Test connection before connecting this fallback provider.");
          updateContinueDisabled(values);
          return;
        }
        await connectProviderAction(providerConnectInput(values));
        const nextConnections = withConnectedProvider(
          connections,
          values.providerId,
          result.balance,
          false,
        );
        setConnections(nextConnections);
        updateContinueDisabled(values, testResults, testedCredentialKeys, nextConnections);
      } catch (error) {
        updateContinueDisabled(values);
        setActionError(actionErrorMessage(error));
      }
    })().catch((error) => {
      updateContinueDisabled();
      setActionError(actionErrorMessage(error));
    });
  }
  async function onSubmit(values: OnboardingConnectProviderInput) {
    setActionError(null);
    if (connectedProvider) return continueToNext(primaryProviderId ?? connectedProvider);
    if (!connectProviderAction || !testProviderConnectionAction)
      return continueToNext(values.providerId);
    try {
      const verifiedProvider = verifiedProviderId(
        drafts,
        testResults,
        testedCredentialKeys,
        values,
      );
      if (!verifiedProvider) {
        setActionError("Test connection before continuing.");
        updateContinueDisabled(values);
        return;
      }
      const verifiedValues = providerValuesFromDraft(verifiedProvider, values, drafts);
      const result = testResults[verifiedProvider];
      await connectProviderAction(providerConnectInput(verifiedValues));
      const nextConnections = withConnectedProvider(
        connections,
        verifiedProvider,
        result?.balance,
        true,
      );
      setConnections(nextConnections);
      updateContinueDisabled(verifiedValues, testResults, testedCredentialKeys, nextConnections);
      if (verifiedProvider !== values.providerId) continueToNext(verifiedProvider, verifiedValues);
    } catch (error) {
      updateContinueDisabled(values);
      setActionError(actionErrorMessage(error));
    }
  }
  function handleProviderSubmit(event: FormEvent<HTMLFormElement>) {
    const values = getValues();
    if (!anyProviderVerified(connections, drafts, testResults, testedCredentialKeys, values))
      return void handleSubmit(onSubmit)(event);
    event.preventDefault();
    void onSubmit(values);
  }
  return (
    <form id={onboardingFormId} onSubmit={handleProviderSubmit}>
      <input type="hidden" {...register("projectId")} />
      <input type="hidden" {...register("providerId")} />
      <div className="text-lg font-semibold tracking-[-0.4px]">Connect your SERP provider</div>
      <div className="mt-1 text-[13px] text-fg-muted">{OWN_PROVIDER_KEY_COST_EXPLANATION}</div>
      <StepConnectProviderCards
        connections={connections}
        onSelect={selectProvider}
        primaryProviderId={primaryProviderId}
        selectedProviderId={selectedProviderId}
        testingProviderId={testingProviderId}
        testResults={testResults}
      />
      {errors.providerId ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{errors.providerId.message}</p>
      ) : null}
      <StepConnectProviderCredentials
        busy={isSubmitting || testingProviderId !== null}
        connectDisabled={!hasCurrentSuccessfulTest}
        errors={errors}
        onFallbackConnect={
          primaryProviderId &&
          primaryProviderId !== selectedProviderId &&
          !connections[selectedProviderId]
            ? handleFallbackConnect
            : undefined
        }
        onCredentialChange={() => clearProviderFeedback()}
        onTest={handleTest}
        providerId={selectedProvider.value}
        providerLabel={selectedProvider.label}
        register={register}
        savedConnection={Boolean(connections[selectedProvider.value])}
        testDisabled={testDisabled}
        testResult={currentTestResult}
        testing={testingProviderId === selectedProvider.value}
      />
      {actionError ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{actionError}</p>
      ) : null}
      <StepConnectProviderSkip flowState={flowState} getValues={getValues} onSkip={onSkip} />
    </form>
  );
}
