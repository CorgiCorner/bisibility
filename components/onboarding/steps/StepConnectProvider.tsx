"use client";

import {
  credentialFieldsSignature,
  hasRequiredCredentialFields,
} from "@/components/integrations/provider-credentials";
import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import {
  actionErrorMessage,
  feedbackClass,
  onboardingFormId,
} from "@/components/onboarding/onboarding-form-utils";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { TestProviderConnectionInput } from "@/lib/schemas/provider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  type ConnectedProviderMap,
  credentialFields,
  draftMatchesStoredTest,
  formDefaults,
  initialDrafts,
  type OnboardingConnectProviderInput,
  type OnboardingSerpProviderId,
  onboardingConnectProviderSchema,
  type ProviderDraftMap,
  type ProviderTestResult,
  pickDraft,
  primaryProvider,
  providerConnectInput,
  providerOptions,
  providerTestInput,
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
  const [testResults, setTestResults] = useState<
    Partial<Record<OnboardingSerpProviderId, ProviderTestResult | null>>
  >({});
  const [testedCredentialKeys, setTestedCredentialKeys] = useState<
    Partial<Record<OnboardingSerpProviderId, string>>
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
    resolver: zodResolver(onboardingConnectProviderSchema),
  });
  const selectedProviderId = watch("providerId") ?? defaults.providerId;
  const credentialValues = {
    credentials: watch("credentials"),
    login: watch("login"),
    secret: watch("secret"),
  };
  const selectedProvider =
    providerOptions.find((provider) => provider.value === selectedProviderId) ?? providerOptions[0];
  const testDisabled = !hasRequiredCredentialFields(
    credentialFields[selectedProvider.value],
    credentialValues,
  );
  const currentCredentialKey = credentialFieldsSignature(
    credentialFields[selectedProvider.value],
    credentialValues,
  );
  const currentTestResult =
    testedCredentialKeys[selectedProvider.value] === currentCredentialKey
      ? testResults[selectedProvider.value]
      : null;
  const hasCurrentSuccessfulTest = currentTestResult?.ok === true;
  const primaryProviderId = primaryProvider(connections);
  const busy = isSubmitting || testingProviderId !== null;

  function clearProviderFeedback(providerId = selectedProviderId) {
    setActionError(null);
    setTestResults((current) => ({ ...current, [providerId]: null }));
    setTestedCredentialKeys((current) => ({ ...current, [providerId]: undefined }));
    if (!primaryProviderId) {
      onContinueDisabledChange?.(true);
    }
  }

  function selectProvider(providerId: OnboardingSerpProviderId) {
    const values = getValues();
    const nextDraft = values.providerId === providerId ? pickDraft(values) : drafts[providerId];
    setDrafts((current) => ({ ...current, [values.providerId]: pickDraft(values) }));
    setValue("providerId", providerId);
    setValue("login", nextDraft.login ?? "");
    setValue("secret", nextDraft.secret ?? "");
    setValue("costPerCheck", nextDraft.costPerCheck);
    setValue("primary", !primaryProviderId);
    setValue("priority", primaryProviderId ? 1 : 0);
    clearErrors();
    setActionError(null);
    // Never wipe the target provider's stored result on selection; recompute gating instead.
    if (!primaryProviderId) {
      const stillVerified =
        Boolean(connections[providerId]) ||
        draftMatchesStoredTest(
          providerId,
          nextDraft,
          testResults[providerId],
          testedCredentialKeys[providerId],
        );
      onContinueDisabledChange?.(!stillVerified);
    }
  }

  async function runTest(values: OnboardingConnectProviderInput) {
    if (!testProviderConnectionAction) return null;
    setTestingProviderId(values.providerId);
    try {
      const result = await testProviderConnectionAction(providerTestInput(values));
      setTestResults((current) => ({ ...current, [values.providerId]: result }));
      setTestedCredentialKeys((current) => ({
        ...current,
        [values.providerId]: credentialFieldsSignature(credentialFields[values.providerId], values),
      }));
      if (!primaryProviderId) {
        onContinueDisabledChange?.(!result.ok);
      }
      return result;
    } finally {
      setTestingProviderId(null);
    }
  }

  function continueToNext(providerId: OnboardingSerpProviderId) {
    const values = { ...getValues(), providerId, primary: true, priority: 0 };
    onComplete?.(values);
    if (onComplete) return;
    router.push(
      buildOnboardingStepHref(4, { ...flowState, providerId, projectId: values.projectId }),
    );
  }

  function handleTest() {
    handleSubmit(async (values) => {
      clearProviderFeedback(values.providerId);
      try {
        await runTest(values);
      } catch (error) {
        if (!primaryProviderId) {
          onContinueDisabledChange?.(true);
        }
        setActionError(actionErrorMessage(error));
      }
    })().catch((error) => setActionError(actionErrorMessage(error)));
  }

  function handleBackupConnect() {
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
            credentialFieldsSignature(credentialFields[values.providerId], values)
        ) {
          setActionError("Test connection before connecting this backup provider.");
          if (!primaryProviderId) {
            onContinueDisabledChange?.(true);
          }
          return;
        }
        await connectProviderAction(providerConnectInput(values, false));
        setConnections((current) => ({
          ...current,
          [values.providerId]: { balance: result.balance, primary: false },
        }));
      } catch (error) {
        if (!primaryProviderId) {
          onContinueDisabledChange?.(true);
        }
        setActionError(actionErrorMessage(error));
      }
    })().catch((error) => setActionError(actionErrorMessage(error)));
  }

  async function onSubmit(values: OnboardingConnectProviderInput) {
    setActionError(null);
    if (primaryProviderId) {
      continueToNext(primaryProviderId);
      return;
    }
    if (!connectProviderAction || !testProviderConnectionAction) {
      continueToNext(values.providerId);
      return;
    }
    try {
      const result = testResults[values.providerId];
      if (
        !result?.ok ||
        testedCredentialKeys[values.providerId] !==
          credentialFieldsSignature(credentialFields[values.providerId], values)
      ) {
        setActionError("Test connection before continuing.");
        if (!primaryProviderId) {
          onContinueDisabledChange?.(true);
        }
        return;
      }
      await connectProviderAction(providerConnectInput(values, true));
      setConnections((current) => ({
        ...current,
        [values.providerId]: { balance: result.balance, primary: true },
      }));
      onContinueDisabledChange?.(false);
    } catch (error) {
      if (!primaryProviderId) {
        onContinueDisabledChange?.(true);
      }
      setActionError(actionErrorMessage(error));
    }
  }

  return (
    <form id={onboardingFormId} onSubmit={handleSubmit(onSubmit)}>
      <input type="hidden" {...register("projectId")} />
      <input type="hidden" {...register("providerId")} />
      <input type="hidden" {...register("primary")} />
      <input type="hidden" {...register("enabled")} />
      <input type="hidden" {...register("priority", { valueAsNumber: true })} />
      <div className="text-lg font-semibold tracking-[-0.4px]">Connect your SERP provider</div>
      <div className="mt-1 text-[13px] text-fg-muted">
        bisibility does not scrape Google directly. Self-hosted installs use your own provider key.
      </div>

      <StepConnectProviderCards
        connections={connections}
        onSelect={selectProvider}
        primaryProviderId={primaryProviderId}
        selectedProviderId={selectedProviderId}
        testingProviderId={testingProviderId}
        testResults={testResults}
      />
      {errors.providerId ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red`}>{errors.providerId.message}</p>
      ) : null}

      <StepConnectProviderCredentials
        busy={busy}
        connectBackupDisabled={!hasCurrentSuccessfulTest}
        errors={errors}
        onBackupConnect={
          primaryProviderId &&
          primaryProviderId !== selectedProviderId &&
          !connections[selectedProviderId]
            ? handleBackupConnect
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
      {actionError ? <p className={`m-0 mt-3 ${feedbackClass} text-red`}>{actionError}</p> : null}

      <StepConnectProviderSkip flowState={flowState} getValues={getValues} onSkip={onSkip} />
    </form>
  );
}
