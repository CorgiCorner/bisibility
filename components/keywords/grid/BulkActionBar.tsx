"use client";

import {
  actionErrorMessage,
  type KeywordWorkspaceActions,
} from "@/components/keywords/action-utils";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, ConfirmModal } from "@/components/ui";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { SerpDepth } from "@/lib/serp/markets";
import {
  CalendarDotsIcon as CalendarDots,
  LinkSimpleIcon as LinkSimple,
  TagIcon as Tag,
  TrashIcon as Trash,
  XIcon as X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BulkActionModal, type BulkMode } from "./BulkActionModal";
import { BulkRunChecksControls } from "./BulkRunChecksControls";
import { bulkTargetView } from "./bulk-target-model";
import { SetScheduleModal } from "./SetScheduleModal";
import type { CheckScheduleSummary } from "./set-schedule-model";

type BulkActionBarProps = Omit<
  KeywordWorkspaceActions,
  "addKeywordsAction" | "bulkSetFrequencyAction"
> & {
  checksRunning?: boolean;
  canDeleteKeyword: boolean;
  canUpdateKeyword: boolean;
  /** The market the page stands in, or `null` for the project level. */
  marketScope?: MarketScope | null;
  onClear: () => void;
  onRunChecks?: (keywordIds: string[], depth?: SerpDepth) => void;
  projectId: string;
  providerConnected?: boolean;
  providerRate?: CostRateInfo;
  selectedRows: KeywordRow[];
};
export function BulkActionBar({
  bulkClearTargetAction,
  bulkDeleteAction,
  bulkSetTargetAction,
  bulkTagAction,
  canDeleteKeyword,
  canUpdateKeyword,
  checksRunning = false,
  marketScope = null,
  onClear,
  onRunChecks,
  projectId,
  providerConnected = true,
  providerRate,
  selectedRows,
}: BulkActionBarProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearTargetsOpen, setClearTargetsOpen] = useState(false);
  const [clearingTargets, setClearingTargets] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mode, setMode] = useState<BulkMode>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [schedules, setSchedules] = useState<CheckScheduleSummary[]>([]);
  const { readOnly } = useProjectWriteMode();
  const selectedIds = selectedRows.map((row) => row.id);
  const selectionKey = selectedIds.join("\0");
  const [depthOverride, setDepthOverride] = useState<{ key: string; depth: SerpDepth } | null>(
    null,
  );
  const chosenDepth = depthOverride?.key === selectionKey ? depthOverride.depth : null;
  const targetView = bulkTargetView(selectedRows);
  if (selectedRows.length === 0) {
    return null;
  }

  function finishAction() {
    setMode(null);
    onClear();
    router.refresh();
  }
  async function handleDelete() {
    if (readOnly) {
      return;
    }
    setActionError(null);
    setDeleting(true);
    try {
      await bulkDeleteAction({ keywordIds: selectedIds, projectId });
      setConfirmOpen(false);
      finishAction();
    } catch (error) {
      setActionError(actionErrorMessage(error));
      throw error;
    } finally {
      setDeleting(false);
    }
  }
  async function handleClearTargets() {
    if (readOnly) return;
    setActionError(null);
    setClearingTargets(true);
    try {
      await bulkClearTargetAction({ keywordIds: selectedIds, projectId });
      setClearTargetsOpen(false);
      finishAction();
    } catch (error) {
      setActionError(actionErrorMessage(error));
      throw error;
    } finally {
      setClearingTargets(false);
    }
  }

  async function openScheduleModal() {
    setActionError(null);
    setScheduleLoading(true);
    try {
      const response = await fetch(
        `/api/check-schedules?project=${encodeURIComponent(projectId)}`,
        { headers: { Accept: "application/json" } },
      );
      const body = (await response.json()) as { data?: CheckScheduleSummary[]; detail?: string };
      if (!response.ok || !body.data) {
        throw new Error(body.detail || "Could not load schedules. Try again.");
      }
      setSchedules(body.data);
      setScheduleOpen(true);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not load schedules. Try again.",
      );
    } finally {
      setScheduleLoading(false);
    }
  }

  return (
    <div className="grid gap-2 border-b border-border px-4 py-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-sans tabular-nums text-[12.5px] font-semibold text-fg">
          {selectedRows.length} selected
        </span>
        {onRunChecks && canUpdateKeyword ? (
          <BulkRunChecksControls
            checksRunning={checksRunning}
            chosenDepth={chosenDepth}
            marketScope={marketScope}
            onDepthChange={(depth) => setDepthOverride({ key: selectionKey, depth })}
            onRunChecks={onRunChecks}
            projectId={projectId}
            providerConnected={providerConnected}
            readOnly={readOnly}
            selectedRows={selectedRows}
          />
        ) : null}
        {canUpdateKeyword ? (
          <ProjectReadOnlyTooltip>
            <Button
              disabled={readOnly}
              onClick={() => setMode(mode === "tag" ? null : "tag")}
              size="xs"
              startIcon={<Tag weight="regular" size={15} />}
              variant="secondary"
            >
              Add tag
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {canUpdateKeyword ? (
          <ProjectReadOnlyTooltip>
            <Button
              disabled={readOnly}
              onClick={() => setMode(mode === "target" ? null : "target")}
              size="xs"
              startIcon={<LinkSimple weight="regular" size={15} />}
              variant="secondary"
            >
              {targetView.actionLabel}
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {canUpdateKeyword ? (
          <ProjectReadOnlyTooltip>
            <Button
              disabled={readOnly || scheduleLoading}
              loading={scheduleLoading}
              loadingLabel="Loading..."
              onClick={() => void openScheduleModal()}
              size="xs"
              startIcon={<CalendarDots weight="regular" size={15} />}
              variant="secondary"
            >
              Set schedule
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {canDeleteKeyword ? (
          <ProjectReadOnlyTooltip>
            <Button
              disabled={readOnly || deleting}
              onClick={() => setConfirmOpen(true)}
              size="xs"
              startIcon={<Trash weight="regular" size={15} />}
              sx={{
                backgroundColor: "transparent",
                border: "1px solid var(--red)",
                color: "var(--red)",
                "&:hover": {
                  backgroundColor: "color-mix(in srgb, var(--red) 12%, transparent)",
                  border: "1px solid var(--red)",
                  color: "var(--red)",
                },
              }}
              variant="secondary"
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        <Button
          onClick={onClear}
          size="xs"
          startIcon={<X weight="regular" size={14} />}
          sx={{ marginLeft: "auto" }}
          variant="ghost"
        >
          Clear
        </Button>
      </div>
      {canDeleteKeyword ? (
        <ConfirmModal
          busy={deleting}
          kind="deleteBulk"
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleDelete}
          open={confirmOpen}
        />
      ) : null}
      {canUpdateKeyword ? (
        <ConfirmModal
          busy={clearingTargets}
          kind="clearTargetUrls"
          onClose={() => setClearTargetsOpen(false)}
          onConfirm={handleClearTargets}
          open={clearTargetsOpen}
        />
      ) : null}
      {canUpdateKeyword ? (
        <BulkActionModal
          actionError={actionError}
          bulkSetTargetAction={bulkSetTargetAction}
          bulkTagAction={bulkTagAction}
          mode={mode}
          onClose={() => {
            setActionError(null);
            setMode(null);
          }}
          onDone={finishAction}
          onError={setActionError}
          onRequestClearTarget={() => {
            setMode(null);
            setClearTargetsOpen(true);
          }}
          projectId={projectId}
          selectedRows={selectedRows}
        />
      ) : null}
      {canUpdateKeyword ? (
        <SetScheduleModal
          onClose={() => setScheduleOpen(false)}
          onDone={finishAction}
          open={scheduleOpen}
          projectId={projectId}
          providerRate={providerRate}
          schedules={schedules}
          selectedRows={selectedRows}
        />
      ) : null}
      {actionError && mode === null ? (
        <p className="m-0 font-sans tabular-nums text-[11.5px] text-red-text">{actionError}</p>
      ) : null}
    </div>
  );
}
