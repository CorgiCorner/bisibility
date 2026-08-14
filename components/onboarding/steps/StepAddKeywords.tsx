"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  onboardingDefaults,
} from "@/components/onboarding/onboarding-fixtures";
import {
  actionErrorMessage,
  feedbackClass,
  onboardingFormId,
} from "@/components/onboarding/onboarding-form-utils";
import { locationValuesForKeys } from "@/components/onboarding/onboarding-location-field";
import { locationSelectionInputForKey } from "@/components/onboarding/onboarding-locations";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";
import { type AddKeywordsMatrixInput, KEYWORD_IMPORT_MAX } from "@/lib/schemas/keyword";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { DEFAULT_SERP_DEPTH, DEFAULT_SERP_DEVICE, type SerpDevice } from "@/lib/serp/markets";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { KeywordImportSummary } from "./KeywordImportSummary";
import {
  type FetchRankedKeywordSuggestionsAction,
  KeywordRankedImport,
} from "./KeywordRankedImport";
import { type ImportTopQueriesAction, KeywordTopQueryImport } from "./KeywordTopQueryImport";
import {
  type KeywordSetupForm,
  keywordFormValues,
  keywordSetupFormSchema,
  projectDefaultsInput,
} from "./keyword-setup-model";
import type { SaveOnboardingMarketsAction } from "./OnboardingMarkets";
import {
  type AddKeywordsForm,
  keywordDraftMessage,
  keywordDraftPreview,
  longKeywordMessage,
} from "./step-add-keywords-model";
import {
  completedTrackingDefaults,
  type OnboardingTrackingDefaultsInput,
  withTrackingDefaults,
} from "./step-schedule-model";
import { TrackingDefaultsFields } from "./TrackingDefaultsFields";

export type { AddKeywordsForm } from "./step-add-keywords-model";
export type AddKeywordsInput = AddKeywordsMatrixInput;

type CreatedKeyword = { id: string; publicId: string };
type StepAddKeywordsProps = {
  addKeywordsAction?: (input: AddKeywordsInput) => Promise<{
    created: number;
    keywordCount?: number;
    keywords: CreatedKeyword[];
    skippedDuplicates: number;
    warnings?: string[];
  }>;
  awaitingPropertySelection?: boolean;
  costPerCheckCents?: number | null;
  defaultValues?: AddKeywordsForm;
  fetchRankedKeywordSuggestionsAction?: FetchRankedKeywordSuggestionsAction;
  flowState?: OnboardingFlowState;
  hasAnalyticsSource?: boolean;
  importTopQueriesAction?: ImportTopQueriesAction;
  monthlyCapCents?: number;
  onComplete?: (
    values: AddKeywordsForm,
    defaults: OnboardingTrackingDefaultsInput,
    keywordCount: number,
    warning?: string | null,
  ) => void;
  onKeywordsChange?: (keywords: string) => void;
  onMarketsChange?: (locations: string[]) => void;
  projectDomain?: string;
  rankedKeywordConnections?: RankedKeywordConnection[];
  saveMarketsAction?: SaveOnboardingMarketsAction;
  trackingDefaults?: OnboardingTrackingDefaultsInput;
  updateProjectDefaultsAction?: (input: ProjectDefaultsInput) => Promise<unknown>;
};

const pausedSchedule = {
  cronExpression: null,
  frequency: "paused",
  jitterMinutes: 60,
  serpDepth: null,
  timezone: "UTC",
} satisfies AddKeywordsMatrixInput["schedule"];

export function StepAddKeywords({
  addKeywordsAction,
  awaitingPropertySelection = false,
  costPerCheckCents,
  defaultValues,
  fetchRankedKeywordSuggestionsAction,
  flowState,
  hasAnalyticsSource = false,
  importTopQueriesAction,
  onComplete,
  onKeywordsChange,
  onMarketsChange,
  projectDomain = "your site",
  rankedKeywordConnections = [],
  saveMarketsAction,
  trackingDefaults,
  updateProjectDefaultsAction,
}: Readonly<StepAddKeywordsProps>) {
  const router = useRouter();
  const scheduleDefaults = withTrackingDefaults(trackingDefaults, flowState);
  const formDefaults: KeywordSetupForm = {
    ...scheduleDefaults,
    device: defaultValues?.device ?? scheduleDefaults.devices[0] ?? DEFAULT_SERP_DEVICE,
    devices: defaultValues?.devices ?? scheduleDefaults.devices,
    keywords: defaultValues?.keywords ?? onboardingDefaults.addKeywords,
    locations: defaultValues?.locations ?? scheduleDefaults.locations,
    projectId: defaultValues?.projectId ?? scheduleDefaults.projectId,
  };
  const [selectedLocations, setSelectedLocations] = useState(() =>
    locationValuesForKeys(formDefaults.locations),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<KeywordSetupForm>({
    defaultValues: formDefaults,
    resolver: zodResolver(keywordSetupFormSchema),
  });
  const keywords = watch("keywords") ?? "";
  const projectId = watch("projectId") ?? flowState?.projectId ?? "";
  const locations = watch("locations") ?? formDefaults.locations;
  const devices = watch("devices") ?? [DEFAULT_SERP_DEVICE];
  const frequency = watch("frequency");
  const serpDepth = watch("serpDepth");
  const preview = keywordDraftPreview(keywords);
  const keywordCount = preview.uniqueKeywords.length;
  const longWarning = preview.longLines > 0 ? longKeywordMessage(preview.longLines) : null;
  const costContext = {
    cronExpression: watch("cronExpression"),
    depth: serpDepth ?? DEFAULT_SERP_DEPTH,
    deviceCount: devices.length,
    frequency,
    locationCount: locations.length,
    overrideCents: costPerCheckCents ?? null,
    providerId: flowState?.providerId ?? null,
  };

  function appendQueries(queries: string[]) {
    if (queries.length === 0) return;
    const next = [keywords.trimEnd(), ...queries].filter(Boolean).join("\n");
    setValue("keywords", next, { shouldDirty: true, shouldValidate: true });
    onKeywordsChange?.(next);
  }

  function setDevices(next: SerpDevice[]) {
    setValue("devices", next, { shouldDirty: true, shouldValidate: true });
    setValue("device", next[0] ?? DEFAULT_SERP_DEVICE, { shouldDirty: true });
  }

  async function onSubmit(values: KeywordSetupForm) {
    setActionError(null);
    setActionSuccess(null);
    setActionWarning(null);
    const defaults = completedTrackingDefaults(values, selectedLocations);
    const submitted = keywordDraftPreview(values.keywords);
    try {
      await saveMarketsAction?.({ marketKeys: values.locations, projectId: values.projectId });
      await updateProjectDefaultsAction?.(projectDefaultsInput(defaults));
      if (!addKeywordsAction) {
        onComplete?.(keywordFormValues(values), defaults, submitted.uniqueKeywords.length);
      } else {
        const result = await addKeywordsAction({
          devices: values.devices,
          keywords: submitted.uniqueKeywords,
          locations: values.locations.map(locationSelectionInputForKey),
          projectId: values.projectId,
          schedule: flowState?.providerId ? undefined : pausedSchedule,
          tags: [],
          targetUrl: null,
        });
        const warning = result.warnings?.join(" ") ?? null;
        setActionSuccess(`${result.created} added, ${result.skippedDuplicates} already tracked`);
        setActionWarning(warning);
        await new Promise((resolve) => setTimeout(resolve, 0));
        onComplete?.(
          keywordFormValues(values),
          defaults,
          result.keywordCount ?? submitted.uniqueKeywords.length,
          warning,
        );
      }
      if (!onComplete) router.push(buildOnboardingStepHref(4, { ...flowState, projectId }));
    } catch (cause) {
      setActionError(actionErrorMessage(cause));
    }
  }

  return (
    <form id={onboardingFormId} onSubmit={handleSubmit(onSubmit)}>
      <input type="hidden" {...register("projectId")} />
      <input type="hidden" {...register("device")} />
      <input type="hidden" {...register("cronExpression")} />
      <input type="hidden" {...register("jitterMinutes")} />
      <input type="hidden" {...register("timezone")} />
      <h2 className="m-0 text-lg font-semibold tracking-[-0.4px]">Add your first keywords</h2>
      <p className="m-0 mt-1 text-[13px] text-fg-muted">
        Paste keywords or import suggestions from the data sources you connected.
      </p>
      {projectId ? (
        <KeywordTopQueryImport
          awaitingPropertySelection={awaitingPropertySelection}
          costContext={costContext}
          currentKeywords={keywords}
          hasAnalyticsSource={hasAnalyticsSource}
          importTopQueriesAction={importTopQueriesAction}
          onAppendQueries={appendQueries}
          projectId={projectId}
        />
      ) : null}
      <KeywordRankedImport
        connections={rankedKeywordConnections}
        currentKeywords={keywords}
        domain={projectDomain}
        fetchAction={fetchRankedKeywordSuggestionsAction}
        onAppendQueries={appendQueries}
        projectId={projectId}
      />
      <textarea
        className="mt-3 min-h-[150px] w-full resize-y rounded-[11px] border border-border-strong bg-transparent px-3.5 py-3 font-mono text-[13px] leading-[1.7] text-fg outline-none focus:border-accent"
        placeholder="One keyword per line"
        {...register("keywords", { onChange: (event) => onKeywordsChange?.(event.target.value) })}
      />
      {errors.keywords && errors.keywords.message !== longWarning ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{errors.keywords.message}</p>
      ) : null}
      <p className={`m-0 mt-2 ${feedbackClass} text-fg-muted`}>{keywordDraftMessage(preview)}</p>
      {longWarning ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{longWarning}</p>
      ) : null}
      {keywordCount >= 450 && keywordCount <= KEYWORD_IMPORT_MAX ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-yellow-text`}>
          approaching the 500-keyword import limit
        </p>
      ) : null}
      <TrackingDefaultsFields
        devices={devices}
        errors={{
          devices: errors.devices?.message,
          frequency: errors.frequency?.message,
          locations: errors.locations?.message,
        }}
        flowState={flowState}
        frequency={frequency}
        initialDepth={formDefaults.serpDepth}
        locations={selectedLocations}
        onDepthChange={(depth) => setValue("serpDepth", depth, { shouldDirty: true })}
        onDevicesChange={setDevices}
        onFrequencyChange={(value: RankCheckFrequency) =>
          setValue("frequency", value, { shouldDirty: true })
        }
        onLocationsChange={(next) => {
          const locationKeys = next.map((item) => item.canonicalKey);
          setSelectedLocations(next);
          setValue("locations", locationKeys, {
            shouldDirty: true,
            shouldValidate: true,
          });
          onMarketsChange?.(locationKeys);
        }}
        serpDepth={serpDepth}
      />
      <KeywordImportSummary
        cronExpression={costContext.cronExpression}
        devices={devices}
        frequency={frequency}
        keywordCount={keywordCount}
        locationCount={locations.length}
        serpDepth={serpDepth}
      />
      {actionError ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-red-text`}>{actionError}</p>
      ) : null}
      {actionSuccess ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-green-text`}>{actionSuccess}</p>
      ) : null}
      {actionWarning ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-yellow-text`}>{actionWarning}</p>
      ) : null}
      {isSubmitting ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-fg-muted`}>Saving setup...</p>
      ) : null}
    </form>
  );
}
