"use client";

import { buildCsvKeywordReview } from "@/components/keywords/AddKeywordCsvReviewModel";
import { splitTagInput } from "@/components/keywords/action-utils";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type AddKeywordDrawerForm,
  type AddKeywordTab,
  addKeywordDrawerSchema,
  appendKeywordSuggestions,
  parseCsvKeywordsResult,
  parseKeywordLines,
} from "@/lib/keywords/add-keyword-drawer-shared";
import { DEFAULT_SERP_DEVICE, type SerpDevice } from "@/lib/serp/constants";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { buildDrawerCsvKeywordRowsForTracking } from "./AddKeywordCsvRows";
import { type AddKeywordDrawerProps, addKeywordDrawerCtaLabel } from "./AddKeywordDrawerExtensions";
import { AddKeywordDrawerFeedback } from "./AddKeywordDrawerFeedback";
import { AddKeywordDrawerFooter } from "./AddKeywordDrawerFooter";
import { drawerFormDefaults } from "./AddKeywordDrawerFormDefaults";
import { AddKeywordDrawerFrame } from "./AddKeywordDrawerFrame";
import { DEFAULT_DRAWER_LOCATION_KEY, initialLocationValue } from "./AddKeywordDrawerLocation";
import { AddKeywordDrawerPanels } from "./AddKeywordDrawerPanels";
import { resetAddKeywordDrawer } from "./AddKeywordDrawerReset";
import { drawerMarketRegistry, selectedDrawerMarketKeys } from "./add-keyword-drawer-markets";
import { useAddKeywordDrawerMarkets } from "./useAddKeywordDrawerMarkets";
import { useAddKeywordDrawerSave } from "./useAddKeywordDrawerSave";
import { useKeywordSuggestionSources } from "./useKeywordSuggestionSources";

type MatrixSelection = { devices: SerpDevice[]; locationKeys: string[] };

export function AddKeywordDrawer({
  addKeywordsAction,
  costContext,
  consumeSavedIds,
  defaultDevice = DEFAULT_SERP_DEVICE,
  defaultLocation = DEFAULT_DRAWER_LOCATION_KEY,
  defaultLocationSelection,
  domain,
  existingKeywords = [],
  initialDevices,
  initialKeyword,
  initialMarketKeys,
  initialScheduleFrequency,
  initialTab,
  onClose,
  onExited,
  onAdded,
  open,
  projectId,
  projectMarkets,
  tagSuggestions = [],
}: AddKeywordDrawerProps) {
  const suggestionSources = useKeywordSuggestionSources(projectId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AddKeywordTab>(initialTab ?? "manual");
  const [csvReviewOpen, setCsvReviewOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const drawerMarkets = drawerMarketRegistry(projectId, projectMarkets);
  const defaultMarketKeys = selectedDrawerMarketKeys(drawerMarkets.markets, initialMarketKeys);
  const defaultDevices = initialDevices?.length ? [...new Set(initialDevices)] : [defaultDevice];
  const [matrixSelection, setMatrixSelection] = useState<MatrixSelection>({
    devices: defaultDevices,
    locationKeys: defaultMarketKeys,
  });
  const [locationValue, setLocationValue] = useState(() =>
    initialLocationValue(defaultLocation, defaultLocationSelection),
  );
  const markets = useAddKeywordDrawerMarkets({
    costContext,
    markets: drawerMarkets,
    projectId,
    selection: matrixSelection,
    setSelection: setMatrixSelection,
  });
  const marketStep = markets.step;
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
  const tags = watch("tags") ?? [];
  const targetUrl = watch("targetUrl");
  const parsedKeywords = useMemo(() => parseKeywordLines(keywordsValue ?? ""), [keywordsValue]);
  const csvParseResult = useMemo(() => parseCsvKeywordsResult(csvText), [csvText]);
  const csvParseError = csvParseResult.error;
  const csvRows = useMemo(
    () =>
      buildDrawerCsvKeywordRowsForTracking(csvText, {
        device: defaultDevice,
        locationValue,
        tags,
        targetUrl,
      }),
    [csvText, defaultDevice, locationValue, tags, targetUrl],
  );
  const reviewItems = useMemo(
    () => buildCsvKeywordReview(csvRows, existingKeywords),
    [csvRows, existingKeywords],
  );
  const count = activeTab === "csv" ? csvParseResult.keywords.length : parsedKeywords.length;
  const hasCsvRowErrors = csvReviewOpen && csvRows.some((row) => row.issues.length > 0);
  const isCsvReviewButton = activeTab === "csv" && !csvReviewOpen;
  const submitDisabled =
    isSubmitting ||
    activeTab === "api" ||
    activeTab === "suggestions" ||
    count === 0 ||
    (activeTab === "manual" &&
      (matrixSelection.locationKeys.length === 0 || matrixSelection.devices.length === 0)) ||
    hasCsvRowErrors ||
    Boolean(activeTab === "csv" && csvParseError);
  const ctaLabel = addKeywordDrawerCtaLabel(activeTab, csvReviewOpen, false);

  const handleMatrixChange = useCallback((next: MatrixSelection) => setMatrixSelection(next), []);

  function handleExited() {
    markets.reset();
    const nextLocation = initialLocationValue(defaultLocation, defaultLocationSelection);
    setLocationValue(nextLocation);
    resetAddKeywordDrawer({
      costContext,
      defaultDevice,
      defaultDevices,
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
      setScheduleId: markets.setScheduleId,
      setTagsText,
    });
    onExited?.();
  }

  function handleTabChange(tab: AddKeywordTab) {
    if (tab === "suggestions") void suggestionSources.load();
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
    checkScheduleId: markets.scheduleId,
    consumeSavedIds,
    csvRows,
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

  function appendSuggestions(queries: string[]) {
    setValue("keywords", appendKeywordSuggestions(keywordsValue ?? "", queries), {
      shouldDirty: true,
      shouldValidate: true,
    });
    handleTabChange("manual");
  }

  async function submit(values: AddKeywordDrawerForm) {
    if (activeTab === "suggestions" || activeTab === "api") return;
    if (activeTab === "csv" && !csvReviewOpen) return handleReviewKeywords();
    return save(values);
  }

  return (
    <AddKeywordDrawerFrame
      creator={markets.creator}
      domain={domain}
      footer={
        activeTab === "suggestions" ? null : (
          <AddKeywordDrawerFooter
            ctaLabel={ctaLabel}
            isReviewMode={isCsvReviewButton}
            isSubmitting={isSubmitting}
            onReview={() => void handleReviewKeywords()}
            submitDisabled={submitDisabled}
          />
        )
      }
      marketOpen={marketStep.open}
      scheduleStep={markets.scheduleStep}
      onClose={onClose}
      onExited={handleExited}
      open={open}
    >
      <form
        className="flex flex-col gap-5.5"
        id="add-keyword-form"
        onSubmit={handleSubmit((values: AddKeywordDrawerForm) => void submit(values))}
      >
        <input type="hidden" {...register("projectId")} />
        <AddKeywordDrawerPanels
          activeTab={activeTab}
          suggestionSources={suggestionSources}
          count={count}
          currentKeywords={keywordsValue ?? ""}
          onAppendQueries={appendSuggestions}
          csvReviewOpen={csvReviewOpen}
          csvText={csvText}
          csvParseError={csvParseError}
          domain={domain}
          errors={errors}
          onAppendTag={appendTag}
          onCsvReviewEdit={() => setCsvReviewOpen(false)}
          onCsvTextChange={handleCsvTextChange}
          onTabChange={handleTabChange}
          onTagsChange={handleTagsChange}
          projectId={projectId}
          register={register}
          reviewItems={reviewItems}
          tagSuggestions={tagSuggestions}
          tagsText={tagsText}
          tracking={markets.tracking(count, handleMatrixChange)}
        />

        <AddKeywordDrawerFeedback error={actionError} warning={actionWarning} />
      </form>
    </AddKeywordDrawerFrame>
  );
}
