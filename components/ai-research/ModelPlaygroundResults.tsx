"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TabStrip } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { mutateAiTrackingAction } from "@/lib/actions/ai-tracking";
import type { PlaygroundTopic } from "@/lib/ai-research/model-playground-view";
import {
  type PlaygroundColumnRequest,
  type PlaygroundEntity,
  type PlaygroundSourceOverride,
  playgroundCitedDomains,
  playgroundColumns,
  playgroundMatrix,
} from "@/lib/ai-research/model-playground-view";
import type { AiResearchResult } from "@/lib/ai-research/types";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ModelPlaygroundColumns } from "./ModelPlaygroundColumns";
import { ModelPlaygroundHistoryButton } from "./ModelPlaygroundHistory";
import { ModelPlaygroundMatrix } from "./ModelPlaygroundMatrix";
import { ModelPlaygroundSources } from "./ModelPlaygroundSources";

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
  onRemove,
  payment,
  projectId,
  prompt,
  reportId,
  result,
  running,
  sourceContext,
  topics,
  unfinished,
}: Readonly<{
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
  const projected = playgroundColumns(columns, result?.rows ?? [], unfinished && !running);
  const matrix = playgroundMatrix(
    projected.map((column) => ({
      citations: column.citations,
      id: column.id,
      text: column.answer,
    })),
    entities,
  );
  const sources = playgroundCitedDomains(
    projected
      .filter((column) => column.answer !== null)
      .map((column) => ({ citations: column.citations, label: column.label })),
    sourceContext,
  );
  const finished = Boolean(reportId) && !running;
  return (
    <div className="grid min-w-0 gap-4" data-model-playground-block="results">
      <div
        className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between"
        data-model-playground-block="toolbar"
      >
        <TabStrip className="w-full md:w-auto md:max-w-full">
          <SegmentedControl
            ariaLabel={t("modelPlayground.viewLabel")}
            className="w-max"
            fitContent
            onChange={setView}
            optionClassName="whitespace-nowrap"
            options={[
              { label: t("modelPlayground.answers"), value: "answers" },
              { label: t("modelPlayground.brands"), value: "brands" },
              { label: t("modelPlayground.sources"), value: "sources" },
            ]}
            size="toolbar"
            value={view}
          />
        </TabStrip>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip content={t("modelPlayground.saveReportHint")}>
            <span>
              <Button
                disabled={!finished}
                href={finished ? appPath(projectId, "agent-reports", reportId ?? "") : undefined}
                variant="secondary"
              >
                {t("modelPlayground.saveReport")}
              </Button>
            </span>
          </Tooltip>
          <Tooltip content={t("modelPlayground.trackPromptHint")}>
            <span>
              <Button
                disabled={!finished || !canTrack || !prompt}
                onClick={() => setTrackOpen(true)}
                type="button"
                variant="secondary"
              >
                {t("modelPlayground.trackPrompt")}
              </Button>
            </span>
          </Tooltip>
          <ModelPlaygroundHistoryButton projectId={projectId} />
        </div>
      </div>
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
      {!running && projected.length === 0 ? (
        <EmptyState
          description={t("modelPlayground.emptyDescription")}
          title={t("modelPlayground.emptyTitle")}
        />
      ) : null}
      {view === "answers" && projected.length > 0 ? (
        <ModelPlaygroundColumns
          columns={projected}
          entities={entities}
          funding={funding}
          onRemove={onRemove}
          payment={payment}
          running={running}
          sourceContext={sourceContext}
        />
      ) : null}
      {view === "brands" && projected.length > 0 ? (
        <ModelPlaygroundMatrix columns={projected.map((column) => column.label)} rows={matrix} />
      ) : null}
      {view === "sources" && projected.length > 0 ? (
        <ModelPlaygroundSources sources={sources} />
      ) : null}
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
    </div>
  );
}
