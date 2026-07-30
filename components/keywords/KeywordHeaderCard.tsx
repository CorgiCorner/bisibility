"use client";

import { AddKeywordDrawer } from "@/components/keywords/add/AddKeywordDrawer";
import {
  buildGoogleSerpUrl,
  type DimensionKind,
  DimensionSwitcher,
  localeForLocation,
} from "@/components/keywords/filters/DimensionSwitcher";
import { Card, IdChip, useToast } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordRow } from "@/lib/queries/keywords";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import { type RunCheckNowInput, runCheckNowSchema } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/markets";
import {
  FlagIcon as Flag,
  GlobeSimpleIcon as GlobeSimple,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { existingKeywordsFromRows } from "./AddKeywordCsvReviewModel";
import {
  type AddKeywordsInput,
  actionErrorMessage,
  type CreateKeywordAlertInput,
  type KeywordAction,
  type KeywordDetailActions,
} from "./action-utils";
import { KeywordEditDrawer } from "./KeywordEditDrawer";
import { KeywordHeaderActions } from "./KeywordHeaderActions";
import { KeywordIndexStatus } from "./KeywordIndexStatus";
import { deriveDomain, deviceValue, metadataChipClassName } from "./keyword-header-model";
import { exportHistoryCsv } from "./keyword-history-export";
import { locationFieldValueFromKeywordLocation } from "./location-field-value";

type KeywordHeaderCardProps = KeywordDetailActions & {
  addKeywordsAction: KeywordAction<AddKeywordsInput>;
  canCreateKeyword: boolean;
  canUpdateKeyword: boolean;
  costContext?: ProjectCostContext;
  keyword: KeywordRow;
  projectId: string;
  tagSuggestions?: readonly string[];
};

export function KeywordHeaderCard({
  addKeywordsAction,
  canCreateKeyword,
  canUpdateKeyword,
  costContext,
  createKeywordAlertAction,
  keyword,
  projectId,
  runCheckNowAction,
  tagSuggestions = [],
  updateKeywordAction,
  updateKeywordScheduleAction,
}: KeywordHeaderCardProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [alertStatus, setAlertStatus] = useState<"created" | "creating" | "idle">("idle");
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [trackPrefill, setTrackPrefill] = useState<{
    device?: "desktop" | "mobile";
    location?: string;
  }>({});
  const {
    formState: { isSubmitting },
    handleSubmit,
    register,
  } = useForm<RunCheckNowInput>({
    defaultValues: { keywordId: keyword.id },
    resolver: zodResolver(runCheckNowSchema),
  });
  const alertCreated = alertStatus === "created";
  const alertCreating = alertStatus === "creating";
  const locale = localeForLocation(keyword.location);
  const serpHref = buildGoogleSerpUrl(keyword.keyword, keyword.location);
  const engineLabel = `${keyword.engine} / ${locale.code}`;
  const domain = deriveDomain(keyword.rankingUrl ?? keyword.targetUrl ?? "");
  const effectiveDepth =
    keyword.schedule?.serp_depth ?? keyword.projectSerpDepth ?? DEFAULT_SERP_DEPTH;
  const providerRate = costContext
    ? {
        overrideCents: costContext.costPerCheckCents,
        providerId: costContext.providerId,
      }
    : undefined;

  async function handleRunCheckNow(values: RunCheckNowInput) {
    try {
      const result = await runCheckNowAction(values);
      if (isBudgetExhaustedResult(result)) {
        showToast(result.message, { tint: "red" });
        return;
      }
      showToast(`Check started (Top ${values.depth ?? effectiveDepth})`, { tint: "green" });
      router.refresh();
    } catch (error) {
      showToast(actionErrorMessage(error), { tint: "red" });
    }
  }

  async function handleCreateKeywordAlert() {
    if (!createKeywordAlertAction || alertCreated || alertCreating) {
      return;
    }

    setAlertStatus("creating");
    try {
      const input: CreateKeywordAlertInput = {
        keywordId: keyword.id,
        projectId,
      };
      await createKeywordAlertAction(input);
      setAlertStatus("created");
      showToast("Alert created", { tint: "green" });
      router.refresh();
    } catch (error) {
      setAlertStatus("idle");
      showToast(actionErrorMessage(error), { tint: "red" });
    }
  }

  function handleTrackDimension(kind: DimensionKind, value: string) {
    let prefill = {};
    if (kind === "device") prefill = { device: deviceValue(value) };
    else if (kind === "location") prefill = { location: value };
    setTrackPrefill(prefill);
    setAddOpen(true);
  }

  const submitRunCheck = (depth: SerpDepth) =>
    handleSubmit((values) => handleRunCheckNow({ ...values, depth }))();

  return (
    <Card className="rounded-[14px]" size="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h2 className="m-0 min-w-0 text-[23px] font-semibold leading-tight tracking-[-0.6px]">
              {keyword.keyword}
            </h2>
            <IdChip size="sm" value={keyword.id} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-[7px]">
            <DimensionSwitcher
              icon={<Flag size={13} />}
              kind="location"
              label={keyword.location.displayName}
              onTrack={canCreateKeyword ? handleTrackDimension : undefined}
              value={keyword.locationName}
            />
            <DimensionSwitcher
              icon={<Monitor size={13} />}
              kind="device"
              label={keyword.device}
              onTrack={canCreateKeyword ? handleTrackDimension : undefined}
              value={keyword.device}
            />
            <DimensionSwitcher
              icon={<GlobeSimple size={13} />}
              kind="engine"
              label={engineLabel}
              onTrack={canCreateKeyword ? handleTrackDimension : undefined}
              serpHref={serpHref}
              value={keyword.engine}
            />
            {keyword.topic ? (
              <span className={metadataChipClassName}>Topic: {keyword.topic}</span>
            ) : null}
            {keyword.intent ? (
              <span className={metadataChipClassName}>Intent: {keyword.intent}</span>
            ) : null}
            {keyword.tags.map((tag) => (
              <span className={metadataChipClassName} key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <KeywordHeaderActions
          alertCreated={alertCreated}
          alertCreating={alertCreating}
          canCreateAlert={Boolean(createKeywordAlertAction)}
          canUpdateKeyword={canUpdateKeyword}
          editing={editing}
          effectiveDepth={effectiveDepth}
          onCreateAlert={() => handleCreateKeywordAlert().catch(() => undefined)}
          onExport={() => exportHistoryCsv(keyword)}
          onRunCheck={(depth) => submitRunCheck(depth).catch(() => undefined)}
          onToggleEdit={() => setEditing((value) => !value)}
          providerRate={providerRate}
          runPending={isSubmitting}
        />
      </div>
      <input type="hidden" {...register("keywordId")} />
      <KeywordIndexStatus presence={keyword.urlPresence} />
      {canUpdateKeyword ? (
        <KeywordEditDrawer
          keyword={keyword}
          onClose={() => setEditing(false)}
          open={editing}
          projectId={projectId}
          providerRate={providerRate}
          updateKeywordAction={updateKeywordAction}
          updateKeywordScheduleAction={updateKeywordScheduleAction}
        />
      ) : null}
      {canCreateKeyword && addOpen ? (
        <AddKeywordDrawer
          addKeywordsAction={addKeywordsAction}
          costContext={costContext}
          defaultDevice={trackPrefill.device ?? deviceValue(keyword.device)}
          defaultLocation={trackPrefill.location ?? keyword.locationName}
          defaultLocationSelection={
            trackPrefill.location
              ? undefined
              : locationFieldValueFromKeywordLocation(keyword.location, keyword.locationName)
          }
          domain={domain}
          existingKeywords={existingKeywordsFromRows([keyword])}
          initialKeyword={keyword.keyword}
          onClose={() => setAddOpen(false)}
          open
          projectId={projectId}
          tagSuggestions={tagSuggestions}
        />
      ) : null}
    </Card>
  );
}
