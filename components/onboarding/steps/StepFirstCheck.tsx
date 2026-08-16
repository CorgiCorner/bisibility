"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import { displayProvider, onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { locationValuesForKeys } from "@/components/onboarding/onboarding-location-field";
import { Button } from "@/components/ui";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
  PlayIcon as Play,
  PlugIcon as Plug,
} from "@phosphor-icons/react";
import { useState } from "react";
import { FirstCheckErrors } from "./FirstCheckErrors";
import { FirstCheckQueueMessage } from "./FirstCheckQueueMessage";
import { FirstCheckResults } from "./FirstCheckResults";
import type { SaveOnboardingMarketsAction } from "./OnboardingMarkets";
import { StepFirstCheckReview } from "./StepFirstCheckReview";
import type { OnboardingTrackingDefaultsInput } from "./step-schedule-model";
import { useFirstCheckKeyword } from "./use-first-check-keyword";
import { type FirstCheckRunActions, useFirstCheckRun } from "./use-first-check-run";
import { useFirstCheckSubmit } from "./use-first-check-submit";

type FirstCheckProject = {
  domain: string | null;
  isSample?: boolean;
  name: string;
  publicId?: string;
};

type StepFirstCheckProps = FirstCheckRunActions & {
  completeOnboardingAction?: (input: { projectId: string }) => Promise<unknown>;
  defaults?: ProjectDefaultsInput | OnboardingTrackingDefaultsInput;
  flowState?: OnboardingFlowState;
  hasAnalyticsSource?: boolean;
  keywordCount?: number;
  keywordDraft?: string;
  onBack?: () => void;
  onTimezoneChange?: (timezone: string) => Promise<void> | void;
  project?: FirstCheckProject | null;
  providerConnected?: boolean;
  providerId?: string | null;
  saveMarketsAction?: SaveOnboardingMarketsAction;
};

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

function isPausedFrequency(frequency: ProjectDefaultsInput["frequency"] | undefined) {
  return frequency === "manual" || frequency === "paused";
}

export function StepFirstCheck({
  completeOnboardingAction,
  defaults,
  flowState,
  keywordCount = 0,
  keywordDraft,
  listFirstCheckCandidatesAction,
  onBack,
  onTimezoneChange,
  project,
  providerConnected,
  providerId,
  runFirstCheckPreviewAction,
  saveMarketsAction,
}: Readonly<StepFirstCheckProps>) {
  const projectId = flowState?.projectId ?? defaults?.projectId ?? null;
  const hasProject = Boolean(projectId);
  const navigationProjectId = project?.publicId ?? projectId;
  const sampleProject = Boolean(project?.isSample);
  const providerReady = !sampleProject && (providerConnected ?? Boolean(flowState?.providerId));
  const paused = isPausedFrequency(defaults?.frequency);
  const markets = selectedMarkets(defaults);
  const devices = selectedDevices(defaults);
  const sampleCount = keywordCount > 0 ? markets.length * devices.length : 0;
  const { keywordError, keywordOptions, retryKeyword, sampleKeyword, setSampleKeyword } =
    useFirstCheckKeyword({
      keywordDraft,
      listFirstCheckCandidatesAction,
      projectId,
      providerReady,
    });
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
  const firstCheckLabel = sampleProject
    ? "Sample project preview only"
    : !providerReady
      ? "Paused until a provider is connected"
      : `${sampleCount} sample ${sampleCount === 1 ? "check" : "checks"} - one per market and device`;
  const queueMessage = sampleProject
    ? "Sample projects keep their synthetic ranking history."
    : !providerReady
      ? null
      : paused
        ? "Manual preview can run now. Scheduled checks stay paused."
        : state.status === "running"
          ? "Sample checks are running. You can open the dashboard while they finish."
          : state.status === "completed"
            ? `Sample done. Every keyword follows your ${frequencyLabel.toLowerCase()} schedule from here.`
            : `${sampleCount} ${sampleCount === 1 ? "check" : "checks"} run once now so you can see it working. Everything else follows your ${frequencyLabel.toLowerCase()} schedule.`;

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
      startIcon={<ArrowLeft aria-hidden size={15} weight="bold" />}
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
      startIcon={<ArrowLeft aria-hidden size={15} weight="bold" />}
      sx={{ color: "var(--fg-muted)" }}
      variant="secondary"
    >
      Back
    </Button>
  );

  return (
    <form id={onboardingFormId} onSubmit={onSubmit}>
      <div className="text-lg font-semibold tracking-[-0.4px]">Run your first check</div>
      <div className="mt-1 text-[13px] text-fg-muted">
        Everything&apos;s ready. Here&apos;s what we&apos;ll start tracking.
      </div>

      <StepFirstCheckReview
        devices={devices}
        firstCheckLabel={firstCheckLabel}
        frequency={defaults?.frequency}
        frequencyLabel={frequencyLabel}
        keywordCount={keywordCount}
        keywordOptions={keywordOptions}
        markets={markets}
        onSampleKeywordChange={setSampleKeyword}
        onTimezoneChange={(value) => void changeTimezone(value)}
        paused={paused}
        projectLabel={project?.domain ?? project?.name ?? "Selected project"}
        providerLabel={providerLabel}
        providerReady={providerReady}
        sampleKeyword={sampleKeyword}
        stateStatus={state.status}
        timezone={timezone}
      />

      <FirstCheckErrors
        keywordError={keywordError}
        onRetryKeyword={retryKeyword}
        submitError={submitError}
        timezoneError={timezoneError}
      />
      {!providerReady ? (
        <div className="mt-5 flex flex-col items-start gap-2.5 rounded-xl border border-border-strong border-dashed bg-bg-sunken p-[18px]">
          <span className="flex items-start gap-2 text-[13px] leading-[1.5] text-fg-muted">
            <Plug aria-hidden className="mt-0.5 shrink-0" size={16} />
            Your keywords are saved. Connect a provider to run the first check.
          </span>
          <Button
            href={buildOnboardingStepHref(2, flowState)}
            size="sm"
            startIcon={<ArrowLeft aria-hidden size={13} weight="bold" />}
            variant="secondary"
          >
            Connect a provider
          </Button>
        </div>
      ) : null}
      {queueMessage ? <FirstCheckQueueMessage message={queueMessage} /> : null}
      <FirstCheckResults onRetryFailed={() => void retryFailed()} state={state} />
      <footer className="mt-7 flex items-center justify-between gap-3 border-border border-t pt-5">
        {backAction}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            disabled={submitting}
            endIcon={<ArrowRight aria-hidden size={13} weight="bold" />}
            size="lg"
            sx={{ color: "var(--fg-muted)", fontSize: 13, paddingX: "8px" }}
            type="submit"
            variant="ghost"
          >
            Open dashboard
          </Button>
          {canPreview ? (
            <Button
              disabled={previewDisabled}
              loading={state.status === "running"}
              loadingLabel={`Running ${sampleCount} sample ${sampleCount === 1 ? "check" : "checks"}`}
              onClick={onPreviewClick}
              size="lg"
              startIcon={<Play aria-hidden size={14} weight="fill" />}
              type="button"
              variant="primary"
            >
              {state.status === "completed"
                ? "Run again"
                : `Run ${sampleCount} sample ${sampleCount === 1 ? "check" : "checks"}`}
            </Button>
          ) : null}
        </div>
      </footer>
    </form>
  );
}
