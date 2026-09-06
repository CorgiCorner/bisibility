"use client";
import { buildOnboardingStepHref } from "@/components/onboarding/onboarding-fixtures";
import { displayProvider, onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { locationValuesForKeys } from "@/components/onboarding/onboarding-location-field";
import { Button } from "@/components/ui";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react";
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

const frequencyLabels: Record<ProjectDefaultsInput["frequency"], string> = {
  custom_cron: "Custom cron",
  daily: "Daily",
  manual: "Manual",
  monthly: "Monthly",
  paused: "Paused",
  weekly: "Weekly",
};
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
export function StepFirstCheck({
  completeOnboardingAction,
  connectProviderAction,
  defaults,
  flowState,
  keywordCount = 0,
  keywordDraft,
  initialConnections,
  initialKeywordText,
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
  const projectId = flowState?.projectId ?? defaults?.projectId ?? null;
  const hasProject = Boolean(projectId);
  const navigationProjectId = project?.publicId ?? projectId;
  const sampleProject = Boolean(project?.isSample);
  const providerReady = !sampleProject && (providerConnected ?? Boolean(flowState?.providerId));
  const paused = isPausedFrequency(defaults?.frequency);
  const markets = selectedMarkets(defaults),
    devices = selectedDevices(defaults);
  const sampleCount = keywordCount > 0 ? markets.length * devices.length : 0;
  const matrixLabel =
    sampleCount > 1
      ? `1 keyword · ${markets.length} ${markets.length === 1 ? "market" : "markets"} · ${devices.length === 2 && devices.includes("desktop") && devices.includes("mobile") ? "both devices" : `${devices.length} ${devices.length === 1 ? "device" : "devices"}`} · ${sampleCount} checks`
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
  const { retryFailed, start, state } = useFirstCheckRun({
    listFirstCheckCandidatesAction,
    runFirstCheckPreviewAction,
  });
  const canPreview = providerReady || sampleProject;
  const previewDisabled =
    state.status === "running" ||
    !hasProject ||
    keywordCount === 0 ||
    sampleProject ||
    (providerReady && !sampleKeyword);
  const providerLabel = providerReady
    ? displayProvider(providerId ?? flowState?.providerId)
    : "Not connected";
  const frequencyLabel = frequencyLabels[defaults?.frequency ?? "daily"] ?? "Daily";
  const hasFailedSampleChecks = state.rows.some((row) => row.status === "failed");
  const queueMessage = sampleProject
    ? "Sample projects keep their synthetic ranking history."
    : !providerReady
      ? null
      : paused
        ? "Manual preview can run now. Scheduled checks stay paused."
        : state.status === "running"
          ? "Sample checks are running. You can open the dashboard while they finish."
          : state.status === "queued"
            ? "Sample checks are queued. You can open the dashboard while the worker starts them."
            : state.status === "completed"
              ? hasFailedSampleChecks
                ? `The sample ${state.rows.length === 1 ? "check" : "checks"} finished with an issue. You can retry the failed ${state.rows.length === 1 ? "check" : "checks"} below. Every keyword still follows your ${frequencyLabel.toLowerCase()} schedule.`
                : `Sample ${state.rows.length === 1 ? "check" : "checks"} finished. Every keyword follows your ${frequencyLabel.toLowerCase()} schedule from here.`
              : `${sampleCount} ${sampleCount === 1 ? "check" : "checks"} run once now so you can see it working. Everything else follows your ${frequencyLabel.toLowerCase()} schedule.`;

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
      setTimezoneError("Timezone could not be saved. Try again.");
    }
  }

  const backAction = onBack ? (
    <Button
      onClick={onBack}
      size="lg"
      startIcon={<ArrowLeft aria-hidden size={15} weight="regular" />}
      sx={{ color: "var(--fg-muted)" }}
      type="button"
      variant="secondary"
    >
      Back
    </Button>
  ) : (
    <Button
      href={buildOnboardingStepHref(3, flowState)}
      size="lg"
      startIcon={<ArrowLeft aria-hidden size={15} weight="regular" />}
      sx={{ color: "var(--fg-muted)" }}
      variant="secondary"
    >
      Back
    </Button>
  );

  const reviewDescription = !providerReady
    ? "Almost ready. Everything is set - connect a data provider whenever you want to run checks."
    : defaults?.frequency === "manual"
      ? "Everything's ready. Run your first check whenever you like - nothing runs until you start it."
      : defaults?.frequency === "paused"
        ? "Everything's ready. Checks are paused until you resume the schedule."
        : `Everything's ready. Your first check runs ${frequencyLabel.toLowerCase()}.`;

  return (
    <form id={onboardingFormId} onSubmit={onSubmit}>
      <div className="text-lg font-semibold tracking-[-0.4px]">Review</div>
      <div className="mt-1 text-[13px] text-fg-muted">{reviewDescription}</div>

      <StepFirstCheckReview
        devices={devices}
        frequency={defaults?.frequency}
        frequencyLabel={frequencyLabel}
        keywordCount={keywordCount}
        markets={markets}
        onTimezoneChange={(value) => void changeTimezone(value)}
        providerLabel={providerReady ? providerLabel : "Not connected"}
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
              Connect
            </Button>
          ) : undefined
        }
        providerReady={providerReady}
        timezone={timezone}
      />

      <FirstCheckErrors
        keywordError={
          keywordError ??
          (!sampleKeyword && providerReady
            ? "The sample keyword could not be loaded. Try again."
            : null)
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
