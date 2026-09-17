"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { buildOnboardingStepHref } from "@/components/onboarding/onboarding-fixtures";
import { feedbackClass, onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { locationSelectionInputForKey } from "@/components/onboarding/onboarding-locations";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { KEYWORD_IMPORT_MAX, KEYWORD_TEXT_MAX } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, DEFAULT_SERP_DEVICE, type SerpDevice } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { KeywordImportSummary } from "./KeywordImportSummary";
import { KeywordRankedImport } from "./KeywordRankedImport";
import { KeywordTopQueryImport } from "./KeywordTopQueryImport";
import { rankedImportMessages, topQueryImportMessages } from "./keyword-import-messages";
import {
  type KeywordSetupForm,
  keywordFormValues,
  keywordSetupFormSchemaFor,
  projectDefaultsInput,
} from "./keyword-setup-model";
import { keywordSetupActionError, type StepAddKeywordsProps } from "./step-add-keywords-contract";
import { focusFirstKeywordSetupError, keywordSetupDefaults } from "./step-add-keywords-defaults";
import { keywordDraftPreview, pausedKeywordSchedule } from "./step-add-keywords-model";
import {
  completedTrackingDefaults,
  draftLocationSelections,
  withTrackingDefaults,
} from "./step-schedule-model";
import { TrackingDefaultsFields } from "./TrackingDefaultsFields";

export type { AddKeywordsInput } from "./step-add-keywords-contract";
export type { AddKeywordsForm } from "./step-add-keywords-model";

export function StepAddKeywords({
  addKeywordsAction,
  calculatorPath,
  costPerCheckCents,
  createMarketAction,
  defaultValues,
  fetchRankedKeywordSuggestionsAction,
  flowState,
  hasAnalyticsSource = false,
  importTopQueriesAction,
  onComplete,
  onKeywordsChange,
  onMarketsChange,
  onSavingChange,
  projectDomain = "your site",
  rankedKeywordConnections = [],
  saveMarketsAction,
  trackingDefaults,
  updateProjectDefaultsAction,
}: Readonly<StepAddKeywordsProps>) {
  const t = useTranslations("onboarding.keywords");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const topImportMessages = topQueryImportMessages(t);
  const rankedMessages = rankedImportMessages(t);
  const scheduleDefaults = withTrackingDefaults(trackingDefaults, flowState);
  const formDefaults = keywordSetupDefaults(scheduleDefaults, defaultValues);
  const [selectedLocations, setSelectedLocations] = useState(() =>
    draftLocationSelections(formDefaults.locations, trackingDefaults?.locationSelections),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch,
  } = useForm<KeywordSetupForm>({
    defaultValues: formDefaults,
    resolver: zodResolver(
      keywordSetupFormSchemaFor(
        {
          empty: t("empty"),
          limit: t("limit", { maximum: KEYWORD_IMPORT_MAX }),
          tooLong: (values) => t("tooLong", values),
        },
        { marketRequired: t("marketRequired") },
      ),
    ),
  });
  const keywords = watch("keywords") ?? "";
  const projectId = watch("projectId") ?? flowState?.projectId ?? "";
  const locations = watch("locations") ?? formDefaults.locations;
  const devices = watch("devices") ?? [DEFAULT_SERP_DEVICE];
  const frequency = watch("frequency");
  const serpDepth = watch("serpDepth");
  const preview = keywordDraftPreview(keywords);
  const keywordCount = preview.uniqueKeywords.length;
  const longWarning =
    preview.longLines > 0
      ? t("tooLong", { count: preview.longLines, maximum: KEYWORD_TEXT_MAX })
      : null;
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
    if (savingRef.current) return;
    savingRef.current = true;
    onSavingChange?.(true);
    setActionError(null);
    setActionWarning(null);
    const defaults = completedTrackingDefaults(values, selectedLocations);
    const submitted = keywordDraftPreview(values.keywords);
    try {
      await saveMarketsAction?.({ marketKeys: values.locations, projectId: values.projectId });
      await updateProjectDefaultsAction?.(projectDefaultsInput(defaults));
      if (!addKeywordsAction) {
        await onComplete?.(keywordFormValues(values), defaults, submitted.uniqueKeywords.length);
      } else {
        const result = await addKeywordsAction({
          devices: values.devices,
          keywords: submitted.uniqueKeywords,
          locations: values.locations.map(locationSelectionInputForKey),
          projectId: values.projectId,
          schedule: flowState?.providerId ? undefined : pausedKeywordSchedule,
          tags: [],
          targetUrl: null,
        });
        const warning = result.warnings?.join(" ") ?? null;
        setActionWarning(warning);
        await onComplete?.(
          keywordFormValues(values),
          defaults,
          result.persistedKeywordCount,
          warning,
        );
      }
      if (!onComplete) router.push(buildOnboardingStepHref(4, { ...flowState, projectId }));
    } catch (cause) {
      setActionError(keywordSetupActionError(cause, sharedErrors, t("saveError")));
    } finally {
      savingRef.current = false;
      onSavingChange?.(false);
    }
  }

  return (
    <form
      aria-busy={isSubmitting}
      data-analytics-mask
      id={onboardingFormId}
      noValidate
      onSubmit={handleSubmit(onSubmit, focusFirstKeywordSetupError)}
    >
      <input type="hidden" {...register("projectId")} />
      <input type="hidden" {...register("device")} />
      <input type="hidden" {...register("cronExpression")} />
      <input type="hidden" {...register("jitterMinutes")} />
      <input type="hidden" {...register("timezone")} />
      <h2 className="m-0 text-lg font-semibold tracking-[-0.4px]">{t("title")}</h2>
      <p className="m-0 mt-1 text-[13px] text-fg-muted">{t("description")}</p>
      {projectId ? (
        <KeywordTopQueryImport
          costContext={costContext}
          currentKeywords={keywords}
          hasAnalyticsSource={hasAnalyticsSource}
          importTopQueriesAction={importTopQueriesAction}
          messages={topImportMessages}
          onAppendQueries={appendQueries}
          projectId={projectId}
        />
      ) : null}
      <KeywordRankedImport
        connections={rankedKeywordConnections}
        currentKeywords={keywords}
        domain={projectDomain}
        fetchAction={fetchRankedKeywordSuggestionsAction}
        messages={rankedMessages}
        onAppendQueries={appendQueries}
        projectId={projectId}
      />
      <textarea
        aria-describedby={errors.keywords ? "onboarding-keywords-error" : undefined}
        aria-invalid={errors.keywords ? true : undefined}
        aria-required="true"
        className="mt-3 min-h-[150px] w-full resize-y rounded-control border border-border-control bg-transparent px-3.5 py-3 text-[13px] font-normal leading-[1.7] text-fg outline-none placeholder:font-normal placeholder:text-fg-muted focus:border-accent"
        placeholder={t("placeholder")}
        {...register("keywords", { onChange: (event) => onKeywordsChange?.(event.target.value) })}
        required
      />
      {errors.keywords && errors.keywords.message !== longWarning ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red-text`} id="onboarding-keywords-error">
          {errors.keywords.message}
        </p>
      ) : null}
      <p className={`m-0 mt-2 ${feedbackClass} text-fg-muted`}>
        {t("summary", {
          duplicates: preview.duplicateLines,
          keywords: preview.uniqueKeywords.length,
        })}
      </p>
      {longWarning ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{longWarning}</p>
      ) : null}
      {keywordCount >= 450 && keywordCount <= KEYWORD_IMPORT_MAX ? (
        <p className={`m-0 mt-2 ${feedbackClass} text-yellow-text`}>{t("approachingLimit")}</p>
      ) : null}
      <TrackingDefaultsFields
        createMarketAction={createMarketAction}
        devices={devices}
        errors={{
          devices: errors.devices?.message,
          frequency: errors.frequency?.message,
          locations: errors.locations?.message,
        }}
        frequency={frequency}
        locations={selectedLocations}
        onDepthChange={(depth) => setValue("serpDepth", depth, { shouldDirty: true })}
        onDevicesChange={setDevices}
        onFrequencyChange={(value: RankCheckFrequency) =>
          setValue("frequency", value, { shouldDirty: true })
        }
        onLocationsChange={(next) => {
          const locationKeys = next.map((item) => item.canonicalKey);
          setSelectedLocations(next);
          setValue("locations", locationKeys, { shouldDirty: true, shouldValidate: true });
          onMarketsChange?.(next);
        }}
        projectId={projectId}
        serpDepth={serpDepth}
      />
      <KeywordImportSummary
        calculatorPath={calculatorPath}
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
      {actionWarning && !isSubmitting ? (
        <p className={`m-0 mt-3 ${feedbackClass} text-yellow-text`}>{actionWarning}</p>
      ) : null}
    </form>
  );
}
