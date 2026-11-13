"use client";

import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { useLiveNow } from "@/components/ui/useLiveNow";
import type { TrackingEngine } from "@/lib/ai-tracking/contract";
import type { OverviewEntityInput } from "@/lib/ai-tracking/overview-model";
import type { TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import { formatPromptUsd } from "@/lib/ai-tracking/prompt-format";
import type { PromptPanel } from "@/lib/ai-tracking/prompts-model";
import {
  type TrackingEnginePriceCard,
  trackingEngineEstimateFromCard,
  trackingPromptEngines,
} from "@/lib/ai-tracking/tracking-engines";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  AiVisibilityPromptAnswer,
  answerSample,
  highlightEntities,
  promptProvenanceLine,
} from "./AiVisibilityPromptAnswer";
import { overviewEngineCopy, overviewEngineLabel } from "./overview-labels";

export type PromptPanelAction = "archive" | "edit" | "pause" | "resume";

export function AiVisibilityPromptPanel({
  canWrite,
  configuredEngines,
  domain,
  enginePrices,
  entities,
  now,
  onAction,
  onOpenEvidence,
  onRun,
  panel,
}: Readonly<{
  canWrite: boolean;
  configuredEngines: readonly string[];
  domain: string | null;
  enginePrices: TrackingEnginePriceCard;
  entities: readonly OverviewEntityInput[];
  now: string;
  onAction: (id: string, action: PromptPanelAction) => void;
  onOpenEvidence: (sample: TrackingSampleRow) => void;
  onRun: (id: string, engine: string | null) => void;
  panel: PromptPanel;
}>) {
  const t = useTranslations("projectAiTracking");
  const format = useFormatter();
  const locale = useLocale();
  const clock = useLiveNow(now, false);
  const labels = overviewEngineCopy((key) => t(key));
  const names = highlightEntities(entities);
  const [engine, setEngine] = useState(panel.answers[0]?.engine ?? "");
  const answer = panel.answers.find((item) => item.engine === engine) ?? panel.answers[0] ?? null;
  const supported = trackingPromptEngines();
  const runEngine =
    configuredEngines.find((item) => supported.includes(item as TrackingEngine)) ??
    supported[0] ??
    "chat_gpt";
  const runPrice = trackingEngineEstimateFromCard(enginePrices, runEngine);
  const runLabel = overviewEngineLabel(runEngine, labels);
  const provenance = {
    manual: t("promptsTab.provenanceManual"),
    model_generated_hypothesis: t("promptsTab.provenanceGenerated"),
    provider_dataset: t("promptsTab.provenanceDataset"),
  }[panel.provenance];
  return (
    <aside className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-bg-elev p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h2 className="m-0 min-w-0 text-sm font-semibold">{panel.text}</h2>
        {panel.status === "paused" ? (
          <StatusChip label={t("promptsTab.statusPaused")} size="sm" tone="attention" />
        ) : null}
        {panel.status === "archived" ? (
          <StatusChip label={t("promptsTab.statusArchived")} size="sm" tone="neutral" />
        ) : null}
      </div>
      {answer ? (
        <AiVisibilityPromptAnswer
          answer={answer}
          domain={domain}
          engines={panel.answers.map((item) => item.engine)}
          labels={labels}
          names={names}
          onEngine={setEngine}
          selected={answer.engine}
        />
      ) : (
        <EmptyState
          action={
            <Button
              disabled={!canWrite}
              onClick={() => onRun(panel.promptId, runEngine)}
              size="sm"
              type="button"
            >
              {runPrice === null
                ? t("promptsTab.runIn", { engine: runLabel })
                : t("promptsTab.runInCost", {
                    cost: formatPromptUsd(runPrice, locale),
                    engine: runLabel,
                  })}
            </Button>
          }
          compact
          title={t("promptsTab.emptyAnswer")}
        />
      )}
      {answer ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => onOpenEvidence(answerSample(panel.text, answer))}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t("promptsTab.fullAnswer")}
          </Button>
          <Button
            disabled={!canWrite}
            onClick={() => onRun(panel.promptId, null)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t("promptsTab.askOthers")}
          </Button>
        </div>
      ) : null}
      {answer ? (
        <p className="m-0 text-sm text-fg-muted">
          {promptProvenanceLine(
            answer,
            locale,
            t,
            answer.finishedAt
              ? format.relativeTime(new Date(answer.finishedAt), new Date(clock))
              : t("overview.unknownCount"),
          )}
        </p>
      ) : null}
      <Disclosure title={t("promptsTab.details")} variant="inline">
        <div className="flex flex-col gap-3 text-sm">
          <p className="m-0">{t("promptsTab.revision", { revision: panel.revision })}</p>
          <p className="m-0">{provenance}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canWrite || panel.status === "archived"}
              onClick={() => onAction(panel.promptId, "edit")}
              size="sm"
              type="button"
              variant="secondary"
            >
              {t("edit")}
            </Button>
            <Button
              disabled={!canWrite || panel.status === "archived"}
              onClick={() =>
                onAction(panel.promptId, panel.status === "paused" ? "resume" : "pause")
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              {panel.status === "paused" ? t("resume") : t("pause")}
            </Button>
            <Button
              disabled={!canWrite || panel.status === "archived"}
              onClick={() => onAction(panel.promptId, "archive")}
              size="sm"
              type="button"
              variant="secondary"
            >
              {t("archive")}
            </Button>
          </div>
        </div>
      </Disclosure>
    </aside>
  );
}
