"use client";

import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { mutateAiTrackingAction } from "@/lib/actions/ai-tracking";
import type {
  PlaygroundColumnRequest,
  PlaygroundEntity,
  PlaygroundSourceOverride,
  PlaygroundTopic,
} from "@/lib/ai-research/model-playground-view";
import type { AiResearchResult } from "@/lib/ai-research/types";
import type { ReportSaveStatus } from "@/lib/model-playground/report-state";
import {
  projectLegacyColumns,
  type ResultColumn,
  resultMatrix,
} from "@/lib/model-playground/result-view";
import type { ModelPlaygroundInput } from "@/lib/model-playground/types";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { ModelPlaygroundColumns } from "./ModelPlaygroundColumns";
import { ModelPlaygroundHistoryButton } from "./ModelPlaygroundHistory";
import type { ModelPlaygroundDraftCard } from "./ModelPlaygroundIdleColumn";
import { ModelPlaygroundMatrix } from "./ModelPlaygroundMatrix";
import { ModelPlaygroundSources } from "./ModelPlaygroundSources";
import { ModelPlaygroundTrackDialog } from "./ModelPlaygroundTrackDialog";
import { ModelPlaygroundViewTabs } from "./ModelPlaygroundViewTabs";
import { reportHint, reportStatusLabel } from "./model-playground-result-copy";

type SourceContext = {
  competitorDomains: readonly string[];
  excludedNames: readonly string[];
  overrides: readonly PlaygroundSourceOverride[];
  ownDomain: string | null;
};

export function ModelPlaygroundResults({
  canTrack,
  columns,
  entities,
  funding,
  payment,
  sourceContext,
  onRemove,
  projectId,
  prompt,
  reportId,
  result,
  running,
  topics,
  unfinished,
  resultColumns,
  onSettings,
  draftCards,
  addColumn,
  disabled,
  previousRunNotice,
  previousMatrixNotice,
  previousAnswerTemplate,
  retainedRun,
  onSaveReport,
  reportSaveStatus,
  setupState,
}: Readonly<{
  setupState?: ReactNode;
  retainedRun?: { runId: string; input: ModelPlaygroundInput };
  onSaveReport?: () => void;
  reportSaveStatus?: ReportSaveStatus;
  resultColumns?: readonly ResultColumn[];
  draftCards?: readonly ModelPlaygroundDraftCard[];
  addColumn?: ReactNode;
  disabled?: boolean;
  previousRunNotice?: string;
  previousMatrixNotice?: string;
  previousAnswerTemplate?: string;
  onSettings?: (id: string) => void;
  canTrack: boolean;
  columns: readonly PlaygroundColumnRequest[];
  entities: readonly PlaygroundEntity[];
  funding: "byok" | "platform" | null;
  onRemove: (id: string) => void;
  payment?: ActionPaymentReceipt;
  projectId: string;
  prompt: string;
  reportId?: string;
  result?: AiResearchResult;
  running: boolean;
  sourceContext: SourceContext;
  topics: readonly PlaygroundTopic[];
  unfinished: boolean;
}>) {
  const t = useTranslations("projectAiResearch");
  const [view, setView] = useState<"answers" | "brands" | "sources">("answers");
  const [trackOpen, setTrackOpen] = useState(false);
  const [topicId, setTopicId] = useState("");
  const [trackMessage, setTrackMessage] = useState<string | null>(null);
  const [trackError, setTrackError] = useState(false);
  const [pending, startTransition] = useTransition();
  const projected =
    resultColumns ??
    projectLegacyColumns(columns, result?.rows ?? [], unfinished && !running, {
      ...sourceContext,
      funding,
    });
  const matrix = resultMatrix(projected, entities);
  const finished = Boolean(reportId) && !running;
  const activeReportStatus = reportSaveStatus ?? "saving";
  return (
    <div className="grid min-w-0 gap-4" data-model-playground-block="results">
      <div
        className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between"
        data-model-playground-block="toolbar"
      >
        <ModelPlaygroundViewTabs value={view} onChange={setView} />
        <div
          className="flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label={t("modelPlayground.viewLabel")}
        >
          <Tooltip
            content={
              retainedRun
                ? finished
                  ? t("modelPlayground.reportSavedHint")
                  : reportHint(t, activeReportStatus)
                : t("modelPlayground.saveReportHint")
            }
          >
            <span>
              <Button
                disabled={
                  !finished &&
                  !(
                    reportSaveStatus &&
                    ["storage", "pending", "check_failed", "read_only", "unclassified"].includes(
                      reportSaveStatus,
                    ) &&
                    onSaveReport
                  )
                }
                onClick={!finished ? onSaveReport : undefined}
                href={finished ? appPath(projectId, "agent-reports", reportId ?? "") : undefined}
                variant="outline"
              >
                {retainedRun
                  ? finished
                    ? t("modelPlayground.reportOpen")
                    : reportStatusLabel(t, activeReportStatus)
                  : t("modelPlayground.saveReport")}
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            content={
              retainedRun
                ? t("modelPlayground.presetHint")
                : draftCards || !finished
                  ? t("modelPlayground.trackRequiresRun")
                  : t("modelPlayground.trackPromptHint")
            }
          >
            <span>
              <Button
                disabled={!(retainedRun ? !running : finished) || !canTrack || !prompt}
                onClick={() => setTrackOpen(true)}
                type="button"
                variant="outline"
              >
                {t("modelPlayground.trackPrompt")}
              </Button>
            </span>
          </Tooltip>
          <ModelPlaygroundHistoryButton projectId={projectId} outline={Boolean(draftCards)} />
        </div>
      </div>
      {setupState}
      {!resultColumns && payment && !running ? (
        <p className="m-0 text-ui-caption text-fg-muted" data-legacy-run-charge>
          {t("modelPlayground.runCost")} <PaymentChargeLine payment={payment} />
        </p>
      ) : null}
      {previousRunNotice ? (
        <p className="m-0 text-ui-caption text-fg-muted" role="status">
          {previousRunNotice} {previousMatrixNotice}
        </p>
      ) : null}
      {trackMessage ? (
        <p
          className={
            trackError ? "m-0 text-ui-body text-red-text" : "m-0 text-ui-body text-fg-muted"
          }
          role="status"
        >
          {trackMessage}
        </p>
      ) : null}
      {!running && projected.length === 0 && !draftCards ? (
        <EmptyState
          description={t("modelPlayground.emptyDescription")}
          title={t("modelPlayground.emptyTitle")}
        />
      ) : null}
      {view === "answers" && (projected.length > 0 || draftCards) ? (
        <ModelPlaygroundColumns
          draftCards={draftCards}
          addColumn={addColumn}
          disabled={disabled}
          columns={projected}
          entities={entities}
          onRemove={onRemove}
          onSettings={onSettings}
          running={running}
          previousRunNotice={previousRunNotice}
          previousAnswerTemplate={previousAnswerTemplate}
        />
      ) : null}
      {(view === "answers" || view === "brands") && projected.length > 0 ? (
        <ModelPlaygroundMatrix columns={projected} rows={matrix} />
      ) : null}
      {view === "sources" && projected.length > 0 ? (
        <ModelPlaygroundSources columns={projected} />
      ) : null}
      {retainedRun ? (
        <ModelPlaygroundTrackDialog
          key={retainedRun.runId}
          open={trackOpen}
          onClose={() => setTrackOpen(false)}
          projectId={projectId}
          runId={retainedRun.runId}
          input={retainedRun.input}
          topics={topics}
        />
      ) : (
        <Modal
          onClose={() => setTrackOpen(false)}
          open={trackOpen}
          title={t("modelPlayground.trackPrompt")}
        >
          <div className="grid gap-3">
            <p className="m-0 text-ui-body text-fg-muted">{prompt}</p>
            <MenuSelect
              ariaLabel={t("modelPlayground.trackTopic")}
              onChange={setTopicId}
              options={[
                { label: t("modelPlayground.trackUnassigned"), value: "" },
                ...topics.map((topic) => ({ label: topic.name, value: topic.id })),
              ]}
              size="input"
              value={topicId}
            />
            <Button
              size="input"
              className="justify-self-start"
              loading={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await mutateAiTrackingAction(projectId, "prompts", "POST", {
                      category: "neutral",
                      text: prompt,
                      topicId: topicId || null,
                    });
                    setTrackError(false);
                    setTrackMessage(t("modelPlayground.trackSaved"));
                    setTrackOpen(false);
                  } catch {
                    setTrackError(true);
                    setTrackMessage(t("modelPlayground.trackError"));
                  }
                });
              }}
              type="button"
            >
              {t("modelPlayground.trackPrompt")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
