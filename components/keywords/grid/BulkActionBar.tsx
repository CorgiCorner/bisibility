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
import {
  type CostRateInfo,
  formatEstimateCents,
  runCostCents,
} from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { SerpDepth } from "@/lib/serp/markets";
import MuiButton from "@mui/material/Button";
import {
  ClockCountdownIcon as ClockCountdown,
  LinkSimpleIcon as LinkSimple,
  TagIcon as Tag,
  TrashIcon as Trash,
  XIcon as X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BulkActionModal, type BulkMode } from "./BulkActionModal";
import { bulkTargetView } from "./bulk-target-model";
import { RunChecksSplitButton } from "./RunChecksSplitButton";
import { effectiveRowDepth } from "./run-check-depth";

type BulkActionBarProps = Omit<KeywordWorkspaceActions, "addKeywordsAction"> & {
  budget?: { capCents: number; spentCents: number };
  checksRunning?: boolean;
  canDeleteKeyword: boolean;
  canUpdateKeyword: boolean;
  onClear: () => void;
  onRunChecks?: (keywordIds: string[], depth?: SerpDepth) => void;
  projectId: string;
  providerRate?: CostRateInfo;
  selectedRows: KeywordRow[];
};

export function BulkActionBar({
  budget,
  bulkClearTargetAction,
  bulkDeleteAction,
  bulkSetFrequencyAction,
  bulkSetTargetAction,
  bulkTagAction,
  canDeleteKeyword,
  canUpdateKeyword,
  checksRunning = false,
  onClear,
  onRunChecks,
  projectId,
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
  const { readOnly } = useProjectWriteMode();

  const selectedIds = selectedRows.map((row) => row.id);
  const targetView = bulkTargetView(selectedRows);
  const estimatedCost = providerRate
    ? runCostCents(selectedRows.map(effectiveRowDepth), providerRate)
    : null;

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

  return (
    <div className="grid gap-2 border-b border-border bg-accent-soft px-4 py-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[12.5px] font-semibold text-accent-text">
          {selectedRows.length} selected
        </span>
        {onRunChecks && canUpdateKeyword ? (
          <RunChecksSplitButton
            checksRunning={checksRunning}
            onRunChecks={onRunChecks}
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
              startIcon={<Tag size={15} />}
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
              startIcon={<LinkSimple size={15} />}
              variant="secondary"
            >
              {targetView.actionLabel}
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {canUpdateKeyword ? (
          <ProjectReadOnlyTooltip>
            <Button
              disabled={readOnly}
              onClick={() => setMode(mode === "frequency" ? null : "frequency")}
              size="xs"
              startIcon={<ClockCountdown size={15} />}
              variant="secondary"
            >
              Set frequency
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {canDeleteKeyword ? (
          <ProjectReadOnlyTooltip>
            {/* Outlined destructive has no shared-Button variant yet ("destructive" is filled). */}
            <MuiButton
              color="error"
              disabled={readOnly || deleting}
              onClick={() => setConfirmOpen(true)}
              size="small"
              startIcon={<Trash size={15} />}
              sx={{ border: "1px solid var(--red)" }}
              variant="outlined"
            >
              {deleting ? "Deleting..." : "Delete"}
            </MuiButton>
          </ProjectReadOnlyTooltip>
        ) : null}
        <Button
          onClick={onClear}
          size="xs"
          startIcon={<X size={14} />}
          sx={{ marginLeft: "auto" }}
          variant="ghost"
        >
          Clear
        </Button>
      </div>
      {onRunChecks && canUpdateKeyword ? (
        <p className="m-0 font-mono text-[11.5px] text-fg-muted">
          {estimatedCost == null
            ? `${selectedRows.length} ${selectedRows.length === 1 ? "check" : "checks"} selected - provider rate unavailable.`
            : `This run ~ ${formatEstimateCents(estimatedCost)}${budget ? ` - ${formatEstimateCents(Math.max(0, budget.capCents - budget.spentCents))} left of ${formatEstimateCents(budget.capCents)} this month` : ""}`}
        </p>
      ) : null}
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
          bulkSetFrequencyAction={bulkSetFrequencyAction}
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
          providerRate={providerRate}
          selectedRows={selectedRows}
        />
      ) : null}
      {actionError && mode === null ? (
        <p className="m-0 font-mono text-[11.5px] text-red-text">{actionError}</p>
      ) : null}
    </div>
  );
}
