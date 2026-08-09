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
import {
  DEFAULT_ONBOARDING_LOCATION_KEY,
  locationSelectionInputForKey,
} from "@/components/onboarding/onboarding-locations";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";
import {
  type AddKeywordsMatrixInput,
  KEYWORD_IMPORT_MAX,
  type KeywordScheduleInput,
} from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, DEFAULT_SERP_DEVICE } from "@/lib/serp/markets";
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
  type AddKeywordsForm,
  addKeywordsFormSchema,
  keywordDraftMessage,
  keywordDraftPreview,
  longKeywordMessage,
} from "./step-add-keywords-model";

export type { AddKeywordsForm } from "./step-add-keywords-model";

function waitForFeedbackPaint() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type CreatedKeyword = { id: string; publicId: string };

export type AddKeywordsInput = AddKeywordsMatrixInput;

type AddKeywordsFlowState = OnboardingFlowState & {
  cronExpression?: string | null;
  frequency?: KeywordScheduleInput["frequency"];
};

type StepAddKeywordsProps = {
  addKeywordsAction?: (input: AddKeywordsInput) => Promise<{
    created: number;
    keywords: CreatedKeyword[];
    skippedDuplicates: number;
    warnings?: string[];
  }>;
  awaitingPropertySelection?: boolean;
  costPerCheckCents?: number | null;
  defaultValues?: AddKeywordsForm;
  flowState?: AddKeywordsFlowState;
  hasAnalyticsSource?: boolean;
  importTopQueriesAction?: ImportTopQueriesAction;
  fetchRankedKeywordSuggestionsAction?: FetchRankedKeywordSuggestionsAction;
  monthlyCapCents?: number;
  onComplete?: (values: AddKeywordsForm, createdCount: number, warning?: string | null) => void;
  onKeywordsChange?: (keywords: string) => void;
  projectDomain?: string;
  rankedKeywordConnections?: RankedKeywordConnection[];
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
  flowState,
  hasAnalyticsSource = false,
  importTopQueriesAction,
  fetchRankedKeywordSuggestionsAction,
  monthlyCapCents,
  onComplete,
  onKeywordsChange,
  projectDomain = "your site",
  rankedKeywordConnections = [],
}: Readonly<StepAddKeywordsProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const defaultLocations = [...(flowState?.locations ?? [DEFAULT_ONBOARDING_LOCATION_KEY])];
  const defaultDevices: AddKeywordsForm["devices"] = flowState?.devices
    ? [...flowState.devices]
    : [DEFAULT_SERP_DEVICE];
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<AddKeywordsForm>({
    defaultValues: defaultValues ?? {
      device: defaultDevices[0] ?? DEFAULT_SERP_DEVICE,
      devices: defaultDevices,
      keywords: onboardingDefaults.addKeywords,
      locations: defaultLocations,
      projectId: flowState?.projectId ?? "",
    },
    resolver: zodResolver(addKeywordsFormSchema),
  });
  const keywords = watch("keywords") ?? "";
  const projectId = watch("projectId") ?? flowState?.projectId ?? "";
  const locations = watch("locations") ?? [DEFAULT_ONBOARDING_LOCATION_KEY];
  const devices = watch("devices") ?? [DEFAULT_SERP_DEVICE];
  const preview = keywordDraftPreview(keywords);
  const keywordCount = preview.uniqueKeywords.length;
  // Rendered once, below the field near the counter. Suppress the duplicate that the
  // form error would otherwise print above when it carries the same long-line message.
  const longKeywordWarning = preview.longLines > 0 ? longKeywordMessage(preview.longLines) : null;
  const suggestionCostContext = {
    cronExpression: flowState?.cronExpression,
    depth: flowState?.serpDepth ?? DEFAULT_SERP_DEPTH,
    deviceCount: devices.length,
    frequency: flowState?.frequency ?? ("daily" as const),
    locationCount: locations.length,
    overrideCents: costPerCheckCents ?? null,
    providerId: flowState?.providerId ?? null,
  };

  function appendImportedQueries(queries: string[]) {
    if (queries.length === 0) return;
    const next = [keywords.trimEnd(), ...queries].filter(Boolean).join("\n");
    setValue("keywords", next, { shouldDirty: true, shouldValidate: true });
    onKeywordsChange?.(next);
  }

  async function onSubmit(values: AddKeywordsForm) {
    setActionError(null);
    setActionSuccess(null);
    setActionWarning(null);
    const submitted = keywordDraftPreview(values.keywords);
    const lines = submitted.uniqueKeywords;

    if (!addKeywordsAction) {
      onComplete?.(values, lines.length * values.locations.length * values.devices.length);
      if (onComplete) {
        return;
      }
      router.push(
        buildOnboardingStepHref(6, {
          ...flowState,
          projectId: values.projectId,
        }),
      );
      return;
    }

    try {
      const result = await addKeywordsAction({
        devices: values.devices,
        keywords: lines,
        locations: values.locations.map(locationSelectionInputForKey),
        projectId: values.projectId,
        schedule: flowState?.providerId ? undefined : pausedSchedule,
        tags: [],
        targetUrl: null,
      });
      const warning = result.warnings?.join(" ") ?? null;
      setActionSuccess(`${result.created} added, ${result.skippedDuplicates} already tracked`);
      setActionWarning(warning);
      await waitForFeedbackPaint();
      onComplete?.(values, result.created, warning);
      if (onComplete) {
        return;
      }
      router.push(
        buildOnboardingStepHref(6, {
          ...flowState,
          projectId: values.projectId,
        }),
      );
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }

  return (
    <form id={onboardingFormId} onSubmit={handleSubmit(onSubmit)}>
      <input type="hidden" {...register("projectId")} />
      <input type="hidden" {...register("device")} />
      <div className="text-lg font-semibold tracking-[-0.4px]">Add your first keywords</div>
      <div className="mt-1 text-[13px] text-fg-muted">
        One keyword per line. Each is checked with your default setup.
      </div>

      {projectId ? (
        <KeywordTopQueryImport
          awaitingPropertySelection={awaitingPropertySelection}
          costContext={suggestionCostContext}
          currentKeywords={keywords}
          hasAnalyticsSource={hasAnalyticsSource}
          importTopQueriesAction={importTopQueriesAction}
          onAppendQueries={appendImportedQueries}
          projectId={projectId}
        />
      ) : null}
      <KeywordRankedImport
        connections={rankedKeywordConnections}
        currentKeywords={keywords}
        domain={projectDomain}
        fetchAction={fetchRankedKeywordSuggestionsAction}
        onAppendQueries={appendImportedQueries}
        projectId={projectId}
      />
      <textarea
        className="mt-3 min-h-[150px] w-full resize-y rounded-[11px] border border-border-strong bg-transparent px-3.5 py-3 font-mono text-[13px] leading-[1.7] text-fg outline-none focus:border-accent"
        placeholder="One keyword per line"
        {...register("keywords", {
          onChange: (event) => onKeywordsChange?.(event.target.value),
        })}
      />
      {errors.keywords && errors.keywords.message !== longKeywordWarning ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{errors.keywords.message}</p>
      ) : null}
      <p className={`m-0 mt-2 ${feedbackClass} text-fg-muted`}>{keywordDraftMessage(preview)}</p>
      {longKeywordWarning ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{longKeywordWarning}</p>
      ) : null}
      {keywordCount >= 450 && keywordCount <= KEYWORD_IMPORT_MAX ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-yellow-text`}>
          approaching the 500-keyword import limit
        </p>
      ) : null}
      <KeywordImportSummary
        costPerCheckCents={costPerCheckCents}
        cronExpression={flowState?.cronExpression}
        deviceCount={devices.length}
        frequency={flowState?.frequency}
        keywordCount={keywordCount}
        locationCount={locations.length}
        monthlyCapCents={monthlyCapCents}
        serpDepth={flowState?.serpDepth ?? DEFAULT_SERP_DEPTH}
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
        <p className={`m-0 mt-3 ${feedbackClass} text-fg-muted`}>
          Adding {keywordCount} {keywordCount === 1 ? "keyword" : "keywords"}...
        </p>
      ) : null}
    </form>
  );
}
