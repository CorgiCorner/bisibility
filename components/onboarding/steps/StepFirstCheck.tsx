"use client";

import {
  type OnboardingFlowState,
  onboardingDefaults,
} from "@/components/onboarding/onboarding-fixtures";
import {
  displayProvider,
  onboardingFormId,
  trackingDefaults,
} from "@/components/onboarding/onboarding-form-utils";
import {
  displayLocationValues,
  locationValuesForKeys,
} from "@/components/onboarding/onboarding-location-field";
import { Button } from "@/components/ui";
import { appPath, appRootPath } from "@/lib/routing/app-path";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import {
  CheckCircleIcon as CheckCircle,
  MagnifyingGlassIcon as MagnifyingGlass,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { SyntheticEvent } from "react";
import { FirstCheckResults } from "./FirstCheckResults";
import type { OnboardingTrackingDefaultsInput } from "./StepSchedule";
import { type FirstCheckRunActions, useFirstCheckRun } from "./use-first-check-run";

type FirstCheckProject = {
  domain: string;
  isSample?: boolean;
  name: string;
  publicId?: string;
};

type StepFirstCheckProps = FirstCheckRunActions & {
  defaults?: ProjectDefaultsInput | OnboardingTrackingDefaultsInput;
  flowState?: OnboardingFlowState;
  hasAnalyticsSource?: boolean;
  keywordCount?: number;
  project?: FirstCheckProject | null;
  providerConnected?: boolean;
};

type CheckState = {
  hasAnalyticsSource: boolean;
  hasProject: boolean;
  keywordCount: number;
  paused: boolean;
  providerReady: boolean;
  sampleProject: boolean;
};

type SummaryRowsInput = CheckState & {
  defaults?: ProjectDefaultsInput | OnboardingTrackingDefaultsInput;
  project?: FirstCheckProject | null;
  providerId?: string | null;
};

const frequencyLabels: Record<ProjectDefaultsInput["frequency"], string> = {
  custom_cron: "Custom cron",
  daily: "Daily",
  manual: "Manual",
  monthly: "Monthly",
  paused: "Paused",
  weekly: "Weekly",
};

function displayDevice(device: ProjectDefaultsInput["device"] | undefined) {
  return device === "mobile" ? "Mobile" : "Desktop";
}

function displayDevices(
  defaults: ProjectDefaultsInput | OnboardingTrackingDefaultsInput | undefined,
) {
  if (!defaults || !("devices" in defaults) || defaults.devices.length <= 1) {
    return displayDevice(defaults?.device);
  }
  return defaults.devices.map(displayDevice).join(", ");
}

function displayLocations(
  defaults: ProjectDefaultsInput | OnboardingTrackingDefaultsInput | undefined,
) {
  if (!defaults || !("locations" in defaults)) {
    return defaults?.country ?? onboardingDefaults.country;
  }
  return displayLocationValues(
    defaults.locationSelections ?? locationValuesForKeys(defaults.locations),
  );
}

function displayFrequency(frequency: ProjectDefaultsInput["frequency"] | undefined) {
  return frequency ? frequencyLabels[frequency] : onboardingDefaults.refresh;
}

function isPausedFrequency(frequency: ProjectDefaultsInput["frequency"] | undefined) {
  return frequency === "manual" || frequency === "paused";
}

function checkSummary({
  hasAnalyticsSource,
  hasProject,
  keywordCount,
  paused,
  providerReady,
  sampleProject,
}: CheckState) {
  if (keywordCount === 0) return "No checks queued";
  if (!hasProject) return "Create a project before running checks";
  if (sampleProject) return "Sample projects don't run real checks";
  if (!providerReady && hasAnalyticsSource) return "Observed positions available from analytics";
  if (!providerReady) return "Connect a SERP provider before running checks";
  if (paused) return "Automatic checks are paused. Run a manual preview now";
  return `Run ${Math.min(keywordCount, 3)} live ${keywordCount === 1 ? "check" : "checks"} now`;
}

function queueStateMessage({
  hasAnalyticsSource,
  hasProject,
  keywordCount,
  paused,
  providerReady,
  sampleProject,
}: CheckState) {
  if (keywordCount === 0) return "No checks queued. Add keywords later to start rank checks.";
  if (!hasProject) return "Create a project before running checks.";
  if (sampleProject) return "Sample projects keep their synthetic ranking history.";
  if (!providerReady && hasAnalyticsSource) {
    return "No SERP provider connected. Review observed Search Console positions instead.";
  }
  // The summary row already states "Connect a SERP provider before running checks",
  // so there is nothing more to add here for the provider-less path.
  if (!providerReady) return null;
  if (paused) return "Manual preview can run now. Scheduled checks stay paused.";
  return "Preview up to 3 checks now. The rest will follow your refresh setting.";
}

function summaryRows({
  defaults,
  hasAnalyticsSource,
  hasProject,
  keywordCount,
  paused,
  project,
  providerReady,
  providerId,
  sampleProject,
}: SummaryRowsInput) {
  return [
    {
      label: "Project",
      value: project?.domain ?? (hasProject ? "Selected project" : "Project not selected"),
    },
    { label: "Provider", value: displayProvider(providerId) },
    {
      label: "Scope",
      value: `${trackingDefaults.engine} · ${displayLocations(defaults)} · ${displayDevices(
        defaults,
      )} · ${displayFrequency(defaults?.frequency)}`,
    },
    {
      accent: true,
      label: "First check",
      value: checkSummary({
        hasAnalyticsSource,
        hasProject,
        keywordCount,
        paused,
        providerReady,
        sampleProject,
      }),
    },
  ];
}

function previewButtonLabel(
  providerReady: boolean,
  hasAnalyticsSource: boolean,
  sampleProject: boolean,
) {
  if (sampleProject) return "Sample project preview only";
  if (!providerReady && hasAnalyticsSource) return "Show observed positions from Search Console";
  return "Run first checks now";
}

export function StepFirstCheck({
  defaults,
  flowState,
  getObservedPositionsAction,
  hasAnalyticsSource = false,
  keywordCount = 0,
  listFirstCheckCandidatesAction,
  project,
  providerConnected,
  queueFirstChecksAction,
  runFirstCheckPreviewAction,
}: StepFirstCheckProps) {
  const router = useRouter();
  const projectId = flowState?.projectId ?? defaults?.projectId ?? null;
  const hasProject = Boolean(projectId);
  const navigationProjectId = project?.publicId ?? projectId;
  const sampleProject = Boolean(project?.isSample);
  const providerReady = !sampleProject && (providerConnected ?? Boolean(flowState?.providerId));
  const paused = isPausedFrequency(defaults?.frequency);
  const { start, state } = useFirstCheckRun({
    getObservedPositionsAction,
    listFirstCheckCandidatesAction,
    queueFirstChecksAction,
    runFirstCheckPreviewAction,
  });
  const rows = summaryRows({
    defaults,
    hasAnalyticsSource,
    hasProject,
    keywordCount,
    paused,
    project,
    providerReady,
    providerId: flowState?.providerId,
    sampleProject,
  });
  const previewMode =
    !providerReady && hasAnalyticsSource && !sampleProject ? "observed" : "preview";
  // Without provider, analytics, or sample data, omit the permanently disabled preview.
  const canPreview = providerReady || hasAnalyticsSource || sampleProject;
  const previewDisabled =
    state.status === "running" || !hasProject || keywordCount === 0 || sampleProject;
  const queueMessage = queueStateMessage({
    hasAnalyticsSource,
    hasProject,
    keywordCount,
    paused,
    providerReady,
    sampleProject,
  });

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(navigationProjectId ? appPath(navigationProjectId, "overview") : appRootPath());
  }

  function onPreviewClick() {
    void start({ mode: previewMode, projectId });
  }

  return (
    <form id={onboardingFormId} onSubmit={onSubmit}>
      <div className="text-lg font-semibold tracking-[-0.4px]">Run your first check</div>
      <div className="mt-1 text-[13px] text-fg-muted">
        Everything&apos;s ready. Here&apos;s what we&apos;ll start tracking.
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        {rows.map((row, index) => (
          <div className={index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"} key={row.label}>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-[13px] text-fg-muted">{row.label}</span>
              <span
                className={`text-right font-mono text-[13px] font-semibold ${
                  row.accent ? "text-accent" : "text-fg"
                }`}
              >
                {row.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {canPreview ? (
          <Button
            disabled={previewDisabled}
            loading={state.status === "running"}
            loadingLabel="Checking..."
            onClick={onPreviewClick}
            size="md"
            startIcon={<MagnifyingGlass aria-hidden size={15} weight="bold" />}
            type="button"
            variant="secondary"
          >
            {previewButtonLabel(providerReady, hasAnalyticsSource, sampleProject)}
          </Button>
        ) : null}
        {queueMessage ? (
          <div className="flex min-w-[220px] flex-1 items-center gap-2 text-[12.5px] text-green">
            <CheckCircle aria-hidden size={16} weight="fill" />
            {queueMessage}
          </div>
        ) : null}
      </div>

      <FirstCheckResults state={state} />
    </form>
  );
}
