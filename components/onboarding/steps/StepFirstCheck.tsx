"use client";
import { buildOnboardingStepHref } from "@/components/onboarding/onboarding-fixtures";
import { displayProvider, onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { locationValuesForKeys } from "@/components/onboarding/onboarding-location-field";
import { Button } from "@/components/ui/Button";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { FirstCheckErrors } from "./FirstCheckErrors";
import { FirstCheckQueueMessage } from "./FirstCheckQueueMessage";
import { FirstCheckResults } from "./FirstCheckResults";
import { InlineProviderSetup } from "./InlineProviderSetup";
import type { StepFirstCheckProps } from "./StepFirstCheck.types";
import { StepFirstCheckCompletion } from "./StepFirstCheckCompletion";
import { StepFirstCheckFooter } from "./StepFirstCheckFooter";
import { StepFirstCheckReview } from "./StepFirstCheckReview";
import type { OnboardingTrackingDefaultsInput } from "./step-schedule-model";
import { useFirstCheckKeyword } from "./use-first-check-keyword";
import { useFirstCheckRun } from "./use-first-check-run";
import { useFirstCheckSubmit } from "./use-first-check-submit";

function selectedDevices(
  defaults: ProjectDefaultsInput | OnboardingTrackingDefaultsInput | undefined,
) {
  if (defaults && "devices" in defaults && defaults.devices.length > 0) return defaults.devices;
  return [defaults?.device ?? "desktop"];
}
function selectedMarkets(
  defaults: ProjectDefaultsInput | OnboardingTrackingDefaultsInput | undefined,
) {
  if (defaults && "locations" in defaults) {
    return defaults.locationSelections ?? locationValuesForKeys(defaults.locations);
  }
  return locationValuesForKeys([defaults?.locationKey ?? "US"]);
}
const isPausedFrequency = (frequency: ProjectDefaultsInput["frequency"] | undefined) =>
  frequency === "manual" || frequency === "paused";
function localizedFrequency(
  t: ReturnType<typeof useTranslations<"onboarding.firstCheck">>,
  frequency: ProjectDefaultsInput["frequency"],
) {
  switch (frequency) {
    case "custom_cron":
      return t("frequency.customCron");
    case "daily":
      return t("frequency.daily");
    case "manual":
      return t("frequency.manual");
    case "monthly":
      return t("frequency.monthly");
    case "paused":
      return t("frequency.paused");
    case "weekly":
      return t("frequency.weekly");
  }
}
export function StepFirstCheck({
  completeOnboardingAction,
  connectProviderAction,
  defaults,
  flowState,
  keywordCount = 0,
  keywordDraft,
  initialConnections,
  initialKeywordText,
  initialFirstCheckCandidates,
  listFirstCheckCandidatesAction,
  nextCheckAt,
  onBack,
  onProviderConnected,
  onTimezoneChange,
  project,
  providerConnected,
  providerDefaultValues,
  providerId,
  runFirstCheckPreviewAction,
  saveMarketsAction,
  testProviderConnectionAction,
}: Readonly<StepFirstCheckProps>) {
  const t = useTranslations("onboarding.firstCheck");
  const projectId = flowState?.projectId ?? defaults?.projectId ?? null;
  const hasProject = Boolean(projectId);
  const navigationProjectId = project?.publicId ?? projectId;
  const sampleProject = Boolean(project?.isSample);
  const providerReady = !sampleProject && (providerConnected ?? Boolean(flowState?.providerId));
  const paused = isPausedFrequency(defaults?.frequency);
  const markets = selectedMarkets(defaults),
    devices = selectedDevices(defaults);
  const sampleCount = keywordCount > 0 ? markets.length * devices.length : 0;
  const deviceLabel =
    devices.length === 2 && devices.includes("desktop") && devices.includes("mobile")
      ? t("review.bothDevices")
      : t("review.devices", { count: devices.length });
  const matrixLabel =
    sampleCount > 1
      ? t("matrix", { checks: sampleCount, devices: deviceLabel, markets: markets.length })
      : null;
  const { keywordError, retryKeyword, sampleKeyword } = useFirstCheckKeyword({
    initialKeywordText,
    keywordDraft,
    listFirstCheckCandidatesAction,
    projectId,
  });
  const [providerExpanded, setProviderExpanded] = useState(false);
  const providerToggleRef = useRef<HTMLButtonElement>(null);
  const providerCloseFocusRef = useRef<"run" | "trigger">("trigger");
  const [timezone, setTimezone] = useState(defaults?.timezone ?? "UTC");
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const { onSubmit, submitError, submitting } = useFirstCheckSubmit({
    completeOnboardingAction,
    marketKeys: markets.map((market) => market.canonicalKey),
    navigationProjectId,
    saveMarketsAction,
  });
  const { retryFailed, start, state } = useFirstCheckRun(
    {
      listFirstCheckCandidatesAction,
      runFirstCheckPreviewAction,
    },
    initialFirstCheckCandidates?.filter((candidate) => candidate.text === sampleKeyword),
    projectId,
  );
  const canPreview = providerReady || sampleProject;
  const previewDisabled =
    state.status === "running" ||
    state.status === "queued" ||
    !hasProject ||
    keywordCount === 0 ||
    sampleProject ||
    (providerReady && !sampleKeyword);
  const providerLabel = providerReady
    ? displayProvider(providerId ?? flowState?.providerId)
    : t("notConnected");
  const frequency = defaults?.frequency ?? "daily";
  const frequencyLabel = localizedFrequency(t, frequency);
  const hasFailedSampleChecks = state.rows.some((row) => row.status === "failed");
  const queueMessage = sampleProject
    ? t("queue.sample")
    : !providerReady
      ? null
      : paused
        ? t("queue.manual")
        : state.status === "running"
          ? t("queue.running")
          : state.status === "queued"
            ? t("queue.queued")
            : state.status === "completed"
              ? hasFailedSampleChecks
                ? t("queue.completedWithFailures", {
                    checks: state.rows.length,
                    frequency: frequencyLabel,
                  })
                : t("queue.completed", { checks: state.rows.length, frequency: frequencyLabel })
              : t("queue.initial", { checks: sampleCount, frequency: frequencyLabel });

  function openProvider() {
    providerCloseFocusRef.current = "trigger";
    setProviderExpanded(true);
  }
  function closeProvider() {
    setProviderExpanded(false);
  }
  function focusRunWhenMounted(node: HTMLButtonElement | null) {
    if (node && providerCloseFocusRef.current === "run") {
      providerCloseFocusRef.current = "trigger";
      node.focus();
    }
  }
  function focusAfterProviderClose() {
    if (providerCloseFocusRef.current === "trigger") providerToggleRef.current?.focus();
  }

  function onPreviewClick() {
    void start({
      keywordText: sampleKeyword,
      limit: sampleCount || undefined,
      projectId,
    });
  }

  async function changeTimezone(value: string) {
    const previous = timezone;
    setTimezone(value);
    setTimezoneError(null);
    try {
      await onTimezoneChange?.(value);
    } catch {
      setTimezone((current) => (current === value ? previous : current));
      setTimezoneError(t("errors.timezone"));
    }
  }

  const backAction = onBack ? (
    <Button
      onClick={onBack}
      size="lg"
      startIcon={<ArrowLeft aria-hidden size={15} weight="regular" />}
      style={{ "--control-color": "var(--fg-muted)" }}
      type="button"
      variant="secondary"
    >
      {t("back")}
    </Button>
  ) : (
    <Button
      href={buildOnboardingStepHref(3, flowState)}
      size="lg"
      startIcon={<ArrowLeft aria-hidden size={15} weight="regular" />}
      style={{ "--control-color": "var(--fg-muted)" }}
      variant="secondary"
    >
      {t("back")}
    </Button>
  );

  const reviewDescription =
    state.status === "completed"
      ? t("description.completed")
      : !providerReady
        ? t("description.noProvider")
        : defaults?.frequency === "manual"
          ? t("description.manual")
          : defaults?.frequency === "paused"
            ? t("description.paused")
            : t("description.scheduled", { frequency: frequencyLabel });

  return (
    <form id={onboardingFormId} onSubmit={onSubmit}>
      <h2 className="m-0 text-lg font-semibold tracking-[-0.4px]">{t("title")}</h2>
      <div className="mt-1 text-[13px] text-fg-muted">{reviewDescription}</div>

      <StepFirstCheckReview
        devices={devices}
        frequency={defaults?.frequency}
        frequencyLabel={frequencyLabel}
        keywordCount={keywordCount}
        markets={markets}
        onTimezoneChange={(value) => void changeTimezone(value)}
        providerLabel={providerLabel}
        providerAction={
          !providerReady ? (
            <Button
              aria-expanded={providerExpanded}
              aria-haspopup="dialog"
              onClick={openProvider}
              ref={providerToggleRef}
              size="xs"
              type="button"
              variant="secondary"
            >
              {t("connect")}
            </Button>
          ) : undefined
        }
        providerReady={providerReady}
        timezone={timezone}
      />

      <FirstCheckErrors
        keywordError={
          keywordError ?? (!sampleKeyword && providerReady ? t("errors.keyword") : null)
        }
        onRetryKeyword={retryKeyword}
        submitError={submitError}
        timezoneError={timezoneError}
      />
      {!providerReady ? (
        <InlineProviderSetup
          connectProviderAction={connectProviderAction}
          defaultValues={providerDefaultValues}
          flowState={flowState}
          initialConnections={initialConnections}
          onCollapse={closeProvider}
          open={providerExpanded}
          onExited={focusAfterProviderClose}
          onComplete={(values, connections) => {
            onProviderConnected?.(values, connections);
            providerCloseFocusRef.current = "run";
          }}
          testProviderConnectionAction={testProviderConnectionAction}
        />
      ) : null}
      {queueMessage ? <FirstCheckQueueMessage message={queueMessage} /> : null}
      <FirstCheckResults onRetryFailed={() => void retryFailed()} state={state} />
      {state.status === "completed" && !hasFailedSampleChecks && navigationProjectId ? (
        <StepFirstCheckCompletion
          frequency={defaults?.frequency}
          frequencyLabel={frequencyLabel}
          keywordCount={keywordCount}
          nextCheckAt={nextCheckAt}
          projectId={navigationProjectId}
          timezone={timezone}
        />
      ) : null}
      <StepFirstCheckFooter
        backAction={backAction}
        canPreview={canPreview}
        matrixLabel={matrixLabel}
        onPreview={onPreviewClick}
        runButtonRef={focusRunWhenMounted}
        previewDisabled={previewDisabled}
        sampleCount={sampleCount}
        state={state}
        submitting={submitting}
      />
    </form>
  );
}
