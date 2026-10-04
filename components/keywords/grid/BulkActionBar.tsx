"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import { useKeywordDeletion } from "@/components/keywords/use-keyword-deletion";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FloatingSelectionBar } from "@/components/ui/FloatingSelectionBar";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { SerpDepth } from "@/lib/serp/constants";
import { CalendarDotsIcon as CalendarDots } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { TagIcon as Tag } from "@phosphor-icons/react/dist/csr/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BulkActionModal, type BulkMode } from "./BulkActionModal";
import { BulkRunChecksControls } from "./BulkRunChecksControls";
import { presentBulkActionError } from "./bulk-action-error";
import { bulkDeleteButtonStyle } from "./bulk-action-styles";
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
  const t = useTranslations("projectRankTracker.keywordImport.management.bulk");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [clearTargetsOpen, setClearTargetsOpen] = useState(false);
  const [clearingTargets, setClearingTargets] = useState(false);
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
  const hasSelection = selectedRows.length > 0;

  function finishAction() {
    setMode(null);
    onClear();
    router.refresh();
  }
  const deletion = useKeywordDeletion({
    action: bulkDeleteAction,
    onDeleted: finishAction,
    projectId,
  });
  async function handleClearTargets() {
    if (readOnly) return;
    setActionError(null);
    setClearingTargets(true);
    try {
      await bulkClearTargetAction({ keywordIds: selectedIds, projectId });
      setClearTargetsOpen(false);
      finishAction();
    } catch (error) {
      setActionError(presentBulkActionError(error, sharedErrors, t("actionFailed")));
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
        throw new Error();
      }
      setSchedules(body.data);
      setScheduleOpen(true);
    } catch (error) {
      setActionError(presentBulkActionError(error, sharedErrors, t("scheduleLoadFailed")));
    } finally {
      setScheduleLoading(false);
    }
  }

  return (
    <>
      <FloatingSelectionBar
        ariaLabel={t("toolbar")}
        clearLabel={t("clear")}
        count={selectedRows.length}
        countLabel={t("selected", { count: selectedRows.length })}
        footer={
          actionError && mode === null ? (
            <p className="m-0 font-sans tabular-nums text-[11.5px] text-red-text">{actionError}</p>
          ) : null
        }
        onClear={onClear}
      >
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
              {t("addTag")}
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
              {t(targetView.actionKey)}
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {canUpdateKeyword ? (
          <ProjectReadOnlyTooltip>
            <Button
              disabled={readOnly || scheduleLoading}
              loading={scheduleLoading}
              loadingLabel={t("loading")}
              onClick={() => void openScheduleModal()}
              size="xs"
              startIcon={<CalendarDots weight="regular" size={15} />}
              variant="secondary"
            >
              {t("setSchedule")}
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {canDeleteKeyword ? (
          <ProjectReadOnlyTooltip>
            <Button
              disabled={readOnly || deletion.busy}
              onClick={() => void deletion.open(selectedIds)}
              size="xs"
              startIcon={<Trash weight="regular" size={15} />}
              style={bulkDeleteButtonStyle}
              variant="secondary"
            >
              {deletion.busy ? t("deleting") : t("delete")}
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
      </FloatingSelectionBar>
      {canDeleteKeyword ? deletion.modal : null}
      {hasSelection && canUpdateKeyword ? (
        <ConfirmModal
          busy={clearingTargets}
          kind="clearTargetUrls"
          onClose={() => setClearTargetsOpen(false)}
          onConfirm={handleClearTargets}
          open={clearTargetsOpen}
        />
      ) : null}
      {hasSelection && canUpdateKeyword ? (
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
      {hasSelection && canUpdateKeyword && scheduleOpen ? (
        <SetScheduleModal
          onClose={() => setScheduleOpen(false)}
          onDone={() => {
            setScheduleOpen(false);
            finishAction();
          }}
          open
          projectId={projectId}
          providerRate={providerRate}
          schedules={schedules}
          selectedRows={selectedRows}
        />
      ) : null}
    </>
  );
}
