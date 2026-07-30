"use client";

import { buildCsvKeywordReview } from "@/components/keywords/AddKeywordCsvReviewModel";
import {
  actionErrorMessage,
  actionWarningMessage,
  splitTagInput,
} from "@/components/keywords/action-utils";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { AppDrawer } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type AddKeywordDrawerForm,
  type AddKeywordTab,
  addKeywordDrawerSchema,
  parseCsvKeywordsResult,
  parseKeywordLines,
} from "@/lib/keywords/add-keyword-drawer-shared";
import { DEFAULT_SERP_DEVICE, DEFAULT_SERP_MARKET, type SerpDevice } from "@/lib/serp/markets";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { buildDrawerCsvKeywordRowsForTracking } from "./AddKeywordCsvRows";
import {
  type AddKeywordDrawerProps,
  addedKeywordResult,
  addKeywordDrawerCtaLabel,
  trackingScheduleValue,
  useAddKeywordTrackingSchedule,
} from "./AddKeywordDrawerExtensions";
import { AddKeywordDrawerFeedback } from "./AddKeywordDrawerFeedback";
import { AddKeywordDrawerFooter } from "./AddKeywordDrawerFooter";
import { countryForSelection, initialLocationValue } from "./AddKeywordDrawerLocation";
import { AddKeywordDrawerPanels } from "./AddKeywordDrawerPanels";
import { addKeywordDrawerInput } from "./AddKeywordDrawerSubmit";

export function AddKeywordDrawer({
  addKeywordsAction,
  costContext,
  consumeSavedIds,
  defaultDevice = DEFAULT_SERP_DEVICE,
  defaultLocation = DEFAULT_SERP_MARKET,
  defaultLocationSelection,
  domain,
  existingKeywords = [],
  initialKeyword,
  initialScheduleFrequency,
  initialTab,
  onClose,
  onAdded,
  open,
  projectId,
  tagSuggestions = [],
  showSchedule = false,
}: AddKeywordDrawerProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AddKeywordTab>(initialTab ?? "manual");
  const [csvReviewOpen, setCsvReviewOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [locationValue, setLocationValue] = useState(() =>
    initialLocationValue(defaultLocation, defaultLocationSelection),
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    trigger,
    watch,
  } = useForm<AddKeywordDrawerForm>({
    defaultValues: {
      city: locationValue.cityName ?? null,
      device: defaultDevice,
      isPaused: false,
      keywords: initialKeyword ?? "",
      location: countryForSelection(locationValue) as AddKeywordDrawerForm["location"],
      locationKey: locationValue.kind === "country" ? undefined : locationValue.canonicalKey,
      projectId,
      schedule: trackingScheduleValue(initialScheduleFrequency, costContext),
      tags: [],
      targetUrl: "",
    },
    resolver: zodResolver(addKeywordDrawerSchema),
  });
  const keywordsValue = watch("keywords");
  const device = watch("device");
  const tags = watch("tags") ?? [];
  const targetUrl = watch("targetUrl");
  const isPaused = Boolean(watch("isPaused"));
  const { handleScheduleChange, scheduleFrequency } = useAddKeywordTrackingSchedule(
    watch,
    setValue,
    costContext,
  );
  const effectivePaused = isPaused || scheduleFrequency === "paused";
  const parsedKeywords = useMemo(() => parseKeywordLines(keywordsValue ?? ""), [keywordsValue]);
  const csvParseResult = useMemo(() => parseCsvKeywordsResult(csvText), [csvText]);
  const csvParseError = csvParseResult.error;
  const csvRows = useMemo(
    () =>
      buildDrawerCsvKeywordRowsForTracking(csvText, {
        device,
        locationValue,
        tags,
        targetUrl,
      }),
    [csvText, device, locationValue, tags, targetUrl],
  );
  const reviewItems = useMemo(
    () => buildCsvKeywordReview(csvRows, existingKeywords),
    [csvRows, existingKeywords],
  );
  const count =
    activeTab === "csv" ? csvRows.filter((row) => row.keyword).length : parsedKeywords.length;
  const hasCsvRowErrors = csvReviewOpen && csvRows.some((row) => row.issues.length > 0);
  const isCsvReviewButton = activeTab === "csv" && !csvReviewOpen;
  const submitDisabled =
    isSubmitting ||
    activeTab === "api" ||
    hasCsvRowErrors ||
    Boolean(activeTab === "csv" && csvParseError);
  const ctaLabel = addKeywordDrawerCtaLabel(activeTab, csvReviewOpen, effectivePaused, count);

  function handleLocationChange(next: LocationFieldValue) {
    setLocationValue(next);
    setValue("location", countryForSelection(next) as AddKeywordDrawerForm["location"], {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("city", next.kind === "city" ? (next.cityName ?? null) : null, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("locationKey", next.kind === "country" ? undefined : next.canonicalKey, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function handleDeviceChange(next: string) {
    setValue("device", next as SerpDevice, { shouldDirty: true, shouldValidate: true });
  }
  function handleClose() {
    setActionError(null);
    setActionWarning(null);
    setActiveTab("manual");
    setCsvReviewOpen(false);
    setCsvText("");
    setTagsText("");
    const nextLocation = initialLocationValue(defaultLocation, defaultLocationSelection);
    setLocationValue(nextLocation);
    reset({
      city: nextLocation.cityName ?? null,
      device: defaultDevice,
      isPaused: false,
      keywords: "",
      location: countryForSelection(nextLocation) as AddKeywordDrawerForm["location"],
      locationKey: nextLocation.kind === "country" ? undefined : nextLocation.canonicalKey,
      projectId,
      schedule: trackingScheduleValue(initialScheduleFrequency, costContext),
      tags: [],
      targetUrl: "",
    });
    onClose();
  }

  function handleTabChange(tab: AddKeywordTab) {
    setActionError(null);
    setActionWarning(null);
    setCsvReviewOpen(false);
    setActiveTab(tab);
  }

  function handleTagsChange(value: string) {
    setTagsText(value);
    setValue("tags", splitTagInput(value), { shouldDirty: true, shouldValidate: true });
  }

  function appendTag(tag: string) {
    handleTagsChange(tagsText ? `${tagsText}, ${tag}` : tag);
  }

  function handleCsvTextChange(value: string) {
    setCsvText(value);
    setCsvReviewOpen(false);
    setValue("keywords", parseCsvKeywordsResult(value).keywords.join("\n"), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function handleReviewKeywords() {
    setActionError(null);
    setActionWarning(null);
    if (csvParseError) return;
    if (await trigger("keywords")) setCsvReviewOpen(true);
  }

  async function save(values: AddKeywordDrawerForm) {
    setActionError(null);
    setActionWarning(null);
    const pending = addKeywordDrawerInput({
      activeTab,
      csvText,
      existingKeywords,
      locationValue,
      values,
    });
    if ("warning" in pending) {
      setActionWarning(pending.warning);
      return;
    }
    try {
      const input =
        consumeSavedIds && consumeSavedIds.length > 0
          ? { ...pending.input, consumeSavedIds: [...consumeSavedIds] }
          : pending.input;
      const result = await addKeywordsAction(input);
      const addedKeywords = addedKeywordResult(result);
      const warning = actionWarningMessage(result);
      if (warning) {
        setActionWarning(warning);
        onAdded?.(addedKeywords);
        router.refresh();
        return;
      }
      onAdded?.(addedKeywords);
      handleClose();
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error));
    }
  }

  async function submit(values: AddKeywordDrawerForm) {
    if (activeTab === "csv" && !csvReviewOpen) return handleReviewKeywords();
    return save(values);
  }

  return (
    <AppDrawer
      description={
        domain ? `Track where ${domain} ranks in Google.` : "Track new keywords in Google."
      }
      footer={
        <AddKeywordDrawerFooter
          ctaLabel={ctaLabel}
          activeTab={activeTab}
          costContext={costContext}
          count={count}
          isPaused={isPaused}
          isReviewMode={isCsvReviewButton}
          isSubmitting={isSubmitting}
          onReview={() => void handleReviewKeywords()}
          register={register}
          submitDisabled={submitDisabled}
          showPauseToggle={!showSchedule}
          frequencyOverride={
            scheduleFrequency === "project_default" ? undefined : scheduleFrequency
          }
        />
      }
      onClose={handleClose}
      open={open}
      title="Add keywords"
    >
      <form
        className="flex flex-col gap-[22px]"
        id="add-keyword-form"
        onSubmit={handleSubmit((values: AddKeywordDrawerForm) => void submit(values))}
      >
        <input type="hidden" {...register("projectId")} />
        <AddKeywordDrawerPanels
          activeTab={activeTab}
          count={count}
          csvReviewOpen={csvReviewOpen}
          csvText={csvText}
          csvParseError={csvParseError}
          device={device}
          domain={domain}
          errors={errors}
          location={locationValue}
          onAppendTag={appendTag}
          onCsvReviewEdit={() => setCsvReviewOpen(false)}
          onCsvTextChange={handleCsvTextChange}
          onDeviceChange={handleDeviceChange}
          onLocationChange={handleLocationChange}
          onScheduleChange={handleScheduleChange}
          onTabChange={handleTabChange}
          onTagsChange={handleTagsChange}
          projectId={projectId}
          projectDefaultFrequency={costContext?.rawFrequency}
          register={register}
          reviewItems={reviewItems}
          tagSuggestions={tagSuggestions}
          tagsText={tagsText}
          scheduleFrequency={scheduleFrequency}
          showSchedule={showSchedule}
        />

        <AddKeywordDrawerFeedback error={actionError} warning={actionWarning} />
      </form>
    </AppDrawer>
  );
}
