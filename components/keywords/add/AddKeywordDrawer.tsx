"use client";

import { buildCsvKeywordReview } from "@/components/keywords/AddKeywordCsvReviewModel";
import { splitTagInput } from "@/components/keywords/action-utils";
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
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { buildDrawerCsvKeywordRowsForTracking } from "./AddKeywordCsvRows";
import {
  type AddKeywordDrawerProps,
  addKeywordDrawerCtaLabel,
  useAddKeywordTrackingSchedule,
} from "./AddKeywordDrawerExtensions";
import { AddKeywordDrawerFeedback } from "./AddKeywordDrawerFeedback";
import { AddKeywordDrawerFooter } from "./AddKeywordDrawerFooter";
import { drawerFormDefaults, drawerLocationFields } from "./AddKeywordDrawerFormDefaults";
import { initialLocationValue } from "./AddKeywordDrawerLocation";
import { AddKeywordDrawerPanels } from "./AddKeywordDrawerPanels";
import { resetAddKeywordDrawer } from "./AddKeywordDrawerReset";
import { useAddKeywordDrawerSave } from "./useAddKeywordDrawerSave";

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
  initialMarketKeys,
  initialScheduleFrequency,
  initialTab,
  onClose,
  onAdded,
  open,
  projectId,
  projectMarkets,
  tagSuggestions = [],
  showSchedule = false,
}: AddKeywordDrawerProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AddKeywordTab>(initialTab ?? "manual");
  const [csvReviewOpen, setCsvReviewOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const drawerMarkets = projectMarkets ?? {
    markets: [],
    maxMarkets: 5,
    monthlyCostCents: null,
    perMarketChecks: 0,
    projectId,
  };
  const defaultMarketKeys = drawerMarkets.markets
    .filter(
      (market) =>
        market.status === "active" &&
        (initialMarketKeys === undefined || initialMarketKeys.includes(market.canonicalKey)),
    )
    .map((market) => market.canonicalKey);
  const [matrixSelection, setMatrixSelection] = useState<{
    devices: SerpDevice[];
    locationKeys: string[];
  }>({
    devices: [defaultDevice],
    locationKeys: defaultMarketKeys,
  });
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
    defaultValues: drawerFormDefaults({
      costContext,
      defaultDevice,
      initialKeyword,
      initialScheduleFrequency,
      location: locationValue,
      projectId,
    }),
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
    (activeTab === "manual" &&
      (matrixSelection.locationKeys.length === 0 || matrixSelection.devices.length === 0)) ||
    hasCsvRowErrors ||
    Boolean(activeTab === "csv" && csvParseError);
  const ctaLabel = addKeywordDrawerCtaLabel(activeTab, csvReviewOpen, effectivePaused, count);

  const handleMatrixChange = useCallback(
    (next: { devices: SerpDevice[]; locationKeys: string[] }) => setMatrixSelection(next),
    [],
  );

  function handleLocationChange(next: LocationFieldValue) {
    setLocationValue(next);
    const fields = drawerLocationFields(next);
    setValue("location", fields.location, { shouldDirty: true, shouldValidate: true });
    setValue("city", fields.city, { shouldDirty: true, shouldValidate: true });
    setValue("locationKey", fields.locationKey, { shouldDirty: true, shouldValidate: true });
  }

  function handleDeviceChange(next: string) {
    setValue("device", next as SerpDevice, { shouldDirty: true, shouldValidate: true });
  }
  function handleExited() {
    const nextLocation = initialLocationValue(defaultLocation, defaultLocationSelection);
    setLocationValue(nextLocation);
    resetAddKeywordDrawer({
      costContext,
      defaultDevice,
      defaultMarketKeys,
      initialScheduleFrequency,
      location: nextLocation,
      projectId,
      reset,
      setActionError,
      setActionWarning,
      setActiveTab,
      setCsvReviewOpen,
      setCsvText,
      setMatrixSelection,
      setTagsText,
    });
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

  const save = useAddKeywordDrawerSave({
    activeTab,
    addKeywordsAction,
    consumeSavedIds,
    csvText,
    devices: matrixSelection.devices,
    existingKeywords,
    locationKeys: matrixSelection.locationKeys,
    locationValue,
    onAdded,
    onClose,
    setActionError,
    setActionWarning,
  });

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
          deviceCount={matrixSelection.devices.length}
          isPaused={isPaused}
          isReviewMode={isCsvReviewButton}
          isSubmitting={isSubmitting}
          keywordCount={count}
          onReview={() => void handleReviewKeywords()}
          register={register}
          submitDisabled={submitDisabled}
          showPauseToggle={!showSchedule}
          marketCount={matrixSelection.locationKeys.length}
        />
      }
      onClose={onClose}
      onExited={handleExited}
      open={open}
      title="Add keywords"
    >
      <form
        className="flex flex-col gap-5.5"
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
          defaultDevice={defaultDevice}
          domain={domain}
          errors={errors}
          location={locationValue}
          onAppendTag={appendTag}
          onCsvReviewEdit={() => setCsvReviewOpen(false)}
          onCsvTextChange={handleCsvTextChange}
          onDeviceChange={handleDeviceChange}
          onLocationChange={handleLocationChange}
          onMatrixChange={handleMatrixChange}
          onScheduleChange={handleScheduleChange}
          onTabChange={handleTabChange}
          onTagsChange={handleTagsChange}
          projectId={projectId}
          projectDefaultFrequency={costContext?.rawFrequency}
          projectMarkets={drawerMarkets}
          initialMarketKeys={defaultMarketKeys}
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
