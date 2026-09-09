"use client";

import { AddKeywordTrackingControls } from "@/components/keywords/add/AddKeywordTrackingControls";
import { useAddKeywordDrawerMarkets } from "@/components/keywords/add/useAddKeywordDrawerMarkets";
import { NewMarketCreator } from "@/components/markets/sheet/NewMarketCreator";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/toast-context";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import type { AddKeywordsMatrixInput, BulkKeywordIdsInput } from "@/lib/schemas/keyword";
import type { SerpDevice } from "@/lib/serp/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { actionErrorMessage, deviceValue, type KeywordAction } from "./action-utils";

type KeywordMarketsDrawerProps = {
  addKeywordsMatrixAction: KeywordAction<AddKeywordsMatrixInput>;
  bulkDeleteAction: KeywordAction<BulkKeywordIdsInput>;
  canCreateKeyword: boolean;
  keyword: KeywordRow;
  onClose: () => void;
  open: boolean;
  projectId: string;
  projectMarkets: ProjectMarketsView;
  targets: readonly KeywordRow[];
};

type MatrixSelection = { devices: SerpDevice[]; locationKeys: string[] };
type PendingAddition = { keywordIds: string[]; selectionKey: string };

function targetKey(target: KeywordRow) {
  return `${target.location.canonicalKey}:${target.device.toLowerCase()}`;
}

function matrixSelectionKey(selection: MatrixSelection) {
  const devices = [...selection.devices].sort();
  return [...selection.locationKeys]
    .sort()
    .flatMap((locationKey) => devices.map((device) => `${locationKey}:${device}`))
    .join("|");
}

function createdKeywordIds(result: unknown) {
  if (!result || typeof result !== "object" || !("keywords" in result)) return [];
  const keywords = (result as { keywords?: unknown }).keywords;
  if (!Array.isArray(keywords)) return [];
  return keywords.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const publicId = (item as { publicId?: unknown }).publicId;
    const id = typeof publicId === "string" ? publicId : (item as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
}

function scheduleInput(keyword: KeywordRow) {
  return {
    cronExpression: keyword.schedule.cron_expression,
    frequency: keyword.schedule.frequency,
    jitterMinutes: keyword.schedule.jitter_minutes,
    serpDepth: keyword.schedule.serp_depth,
    timezone: keyword.schedule.timezone,
  };
}

function checkDeltaLabel(current: number, next: number) {
  const delta = next - current;
  if (delta === 0) return "No change to checks per run.";
  return `${delta > 0 ? "+" : ""}${delta} ${Math.abs(delta) === 1 ? "check" : "checks"} per run.`;
}

export function KeywordMarketsDrawer({
  addKeywordsMatrixAction,
  bulkDeleteAction,
  canCreateKeyword,
  keyword,
  onClose,
  open,
  projectId,
  projectMarkets,
  targets,
}: Readonly<KeywordMarketsDrawerProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const uniqueTargets = [...new Map(targets.map((target) => [target.id, target])).values()];
  const initialMarketKeys = [
    ...new Set(uniqueTargets.map((target) => target.location.canonicalKey)),
  ];
  const initialDevices = [...new Set(uniqueTargets.map((target) => deviceValue(target.device)))];
  const [selection, setSelection] = useState<MatrixSelection>({
    devices: initialDevices,
    locationKeys: initialMarketKeys,
  });
  const marketFlow = useAddKeywordDrawerMarkets({
    markets: projectMarkets,
    projectId,
    selection,
    setSelection,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAddition, setPendingAddition] = useState<PendingAddition | null>(null);
  const desiredKeys = new Set(
    selection.locationKeys.flatMap((locationKey) =>
      selection.devices.map((device) => `${locationKey}:${device}`),
    ),
  );
  const deleteTargets = uniqueTargets.filter((target) => !desiredKeys.has(targetKey(target)));
  const existingKeys = new Set(uniqueTargets.map(targetKey));
  const addsTargets = [...desiredKeys].some((key) => !existingKeys.has(key));
  const nextCount = desiredKeys.size;
  const valid = selection.locationKeys.length > 0 && selection.devices.length > 0;

  async function save() {
    if (!valid || saving) return;
    if (addsTargets && !canCreateKeyword) {
      setError("You do not have permission to add keyword targets.");
      return;
    }
    setSaving(true);
    setError(null);
    const currentSelectionKey = matrixSelectionKey(selection);
    const reusableAddition =
      pendingAddition?.selectionKey === currentSelectionKey ? pendingAddition : null;
    let addedIds = reusableAddition?.keywordIds ?? [];
    try {
      if (addsTargets && !reusableAddition) {
        const result = await addKeywordsMatrixAction({
          devices: selection.devices,
          intent: keyword.intent,
          keywords: [keyword.keyword],
          locations: selection.locationKeys.map((locationKey) => ({ locationKey })),
          projectId,
          schedule: scheduleInput(keyword),
          tags: keyword.tags,
          targetUrl: keyword.targetUrl,
          topic: keyword.topic,
        });
        addedIds = createdKeywordIds(result);
        if (addedIds.length > 0) {
          setPendingAddition({ keywordIds: addedIds, selectionKey: currentSelectionKey });
        }
      }
      const currentDeleted = deleteTargets.some((target) => target.id === keyword.id);
      const retained = uniqueTargets.find((target) => desiredKeys.has(targetKey(target)));
      if (currentDeleted && !retained && addedIds.length === 0) {
        throw new Error("The replacement target is not available yet. Refresh and try again.");
      }
      if (deleteTargets.length > 0) {
        await bulkDeleteAction({
          keywordIds: deleteTargets.map((target) => target.id),
          projectId,
        });
      }
      const nextId = retained?.id ?? addedIds[0];
      setPendingAddition(null);
      showToast("Updated markets and devices", { severity: "success" });
      onClose();
      if (currentDeleted && nextId) {
        router.push(appPath(asProjectRef(projectId), "rank-tracker", nextId));
      } else {
        router.refresh();
      }
    } catch (cause) {
      if (addedIds.length > 0) {
        setError("New targets were added, but old targets could not be removed. Retry to finish.");
        router.refresh();
      } else {
        setError(actionErrorMessage(cause, "Markets and devices could not be updated."));
      }
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex items-center gap-2.5">
      <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
        Cancel
      </Button>
      <Button
        className="flex-1"
        disabled={!valid || saving}
        loading={saving}
        loadingLabel="Saving..."
        onClick={() => void save()}
        type="button"
      >
        Save markets and devices
      </Button>
    </div>
  );

  return (
    <NewMarketCreator {...marketFlow.creator} definitionOnly={{ devices: selection.devices }}>
      {(market) => (
        <Sheet
          backAction={
            marketFlow.step.open ? { label: "Back to keyword", onClick: market.onBack } : undefined
          }
          footer={marketFlow.step.open ? market.footer : footer}
          onClose={onClose}
          onExited={market.onClose}
          open={open}
          title={
            marketFlow.step.open ? (
              market.title
            ) : (
              <span className="block min-w-0">
                <span className="block">Markets and devices</span>
                <span className="mt-1 block truncate text-[12px] font-normal text-fg-muted">
                  {keyword.keyword}
                </span>
              </span>
            )
          }
        >
          {marketFlow.step.open ? (
            market.content
          ) : (
            <>
              <p className="m-0 mb-4 text-[12px] text-fg-muted">
                This keyword is tracked for every selected market and device.
              </p>
              <div className="grid gap-4">
                <AddKeywordTrackingControls
                  {...marketFlow.tracking(1, setSelection)}
                  schedules={[]}
                  showSchedule={false}
                />
              </div>
              <div
                aria-label="Keyword target change"
                className="mt-5 rounded-control border border-border bg-bg-sunken px-3.5 py-3"
              >
                <p className="m-0 font-sans tabular-nums text-[11px] text-fg">
                  {selection.locationKeys.length} markets x {selection.devices.length}{" "}
                  {selection.devices.length === 1 ? "device" : "devices"} = {nextCount} checks per
                  run
                </p>
                <p className="m-0 mt-1 text-[11.5px] text-fg-muted">
                  {checkDeltaLabel(uniqueTargets.length, nextCount)}
                </p>
              </div>
              {!valid ? (
                <p className="mt-3 text-[12px] text-red-text">
                  Select at least one market and device.
                </p>
              ) : null}
              {error ? <p className="mt-3 text-[12px] text-red-text">{error}</p> : null}
            </>
          )}
        </Sheet>
      )}
    </NewMarketCreator>
  );
}
