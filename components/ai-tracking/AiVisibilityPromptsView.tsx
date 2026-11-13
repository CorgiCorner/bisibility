"use client";

import { AiVisibilityTabs } from "@/components/ai-tracking/AiVisibilityTabs";
import { TrackingBulkActions } from "@/components/ai-tracking/TrackingBulkActions";
import { aiVisibilityBlocks } from "@/components/tracking-loading/ai-visibility-layout";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
  type OverviewEntityInput,
  type OverviewFilters,
  type OverviewMarketOption,
} from "@/lib/ai-tracking/overview-model";
import type { TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import { formatPromptUsd } from "@/lib/ai-tracking/prompt-format";
import type { PromptOutcomeRow, PromptPanel } from "@/lib/ai-tracking/prompts-model";
import {
  defaultPromptRunEstimateFromCard,
  type TrackingEnginePriceCard,
} from "@/lib/ai-tracking/tracking-engines";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AiVisibilityOverviewFilters } from "./AiVisibilityOverviewFilters";
import { AiVisibilityPromptPanel, type PromptPanelAction } from "./AiVisibilityPromptPanel";
import { AiVisibilityPromptsTable } from "./AiVisibilityPromptsTable";

export function AiVisibilityPromptsView({
  activePromptCount,
  addHref,
  canWrite,
  domain,
  enginePrices,
  engines,
  entities,
  error,
  filters,
  historyHref,
  markets,
  now,
  onAssignTopic,
  onBulk,
  onFilter,
  onOpenEvidence,
  onPromptAction,
  onRunPrompt,
  onSelect,
  onSelectionChange,
  panel,
  pending,
  projectId,
  rows,
  runHref,
  selectedId,
  selection,
  topicActions = null,
  topics,
  truncated,
}: Readonly<{
  activePromptCount: number;
  addHref: string;
  canWrite: boolean;
  domain: string | null;
  enginePrices: TrackingEnginePriceCard;
  engines: readonly string[];
  entities: readonly OverviewEntityInput[];
  error: string | null;
  filters: OverviewFilters;
  historyHref: string;
  markets: readonly OverviewMarketOption[];
  now: string;
  onAssignTopic: (topicId: string | null) => void;
  onBulk: (action: "archive" | "pause" | "resume") => void;
  onFilter: (filters: OverviewFilters) => void;
  onOpenEvidence: (sample: TrackingSampleRow) => void;
  onPromptAction: (id: string, action: PromptPanelAction) => void;
  onRunPrompt: (id: string, engine: string | null) => void;
  onSelect: (id: string) => void;
  onSelectionChange: (next: ReadonlySet<string>) => void;
  panel: PromptPanel | null;
  pending: boolean;
  projectId: string;
  rows: readonly PromptOutcomeRow[];
  runHref: string;
  selectedId: string | null;
  selection: ReadonlySet<string>;
  topicActions?: ReactNode;
  topics: readonly { id: string; name: string }[];
  truncated: boolean;
}>) {
  const t = useTranslations("projectAiTracking");
  const locale = useLocale();
  const estimate = defaultPromptRunEstimateFromCard(enginePrices, activePromptCount);
  const runLabel =
    estimate === null
      ? t("overview.runNow")
      : t("promptsTab.runNowCost", { cost: formatPromptUsd(estimate, locale) });
  const selected = rows.find((row) => row.id === panel?.promptId);
  return (
    <div
      className="flex min-w-0 flex-col gap-4"
      data-visibility-blocks={aiVisibilityBlocks.prompts.join(" ")}
      data-visibility-tab="prompts"
    >
      <AiVisibilityTabs
        actions={
          <>
            {canWrite ? (
              <Button component={Link} href={runHref} size="sm" variant="secondary">
                {runLabel}
              </Button>
            ) : (
              <Button disabled size="sm" type="button" variant="secondary">
                {runLabel}
              </Button>
            )}
            {canWrite ? (
              <Button component={Link} href={addHref} size="sm">
                {t("overview.addPrompts")}
              </Button>
            ) : (
              <Button disabled size="sm" type="button">
                {t("overview.addPrompts")}
              </Button>
            )}
          </>
        }
        active="prompts"
        projectId={projectId}
        promptCount={activePromptCount}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AiVisibilityOverviewFilters
          engines={engines}
          filters={filters}
          markets={markets}
          onFilter={onFilter}
          topics={topics}
        />
        <Button component={Link} href={historyHref} size="sm" variant="outline">
          {t("runHistory")}
        </Button>
      </div>
      {truncated ? (
        <p className="m-0 text-sm text-fg-muted">
          {t("overview.truncated", { count: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT })}
        </p>
      ) : null}
      {error ? (
        <p className="m-0 text-sm text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      {topicActions}
      {canWrite && selection.size > 0 ? (
        <div className="flex flex-col gap-2">
          <TrackingBulkActions count={selection.size} onAction={onBulk} pending={pending} />
          <MenuSelect
            ariaLabel={t("promptsTab.assignTopic")}
            onChange={(value) => {
              if (value === "none") onAssignTopic(null);
              else if (value) onAssignTopic(value);
            }}
            options={[
              { label: t("promptsTab.assignTopic"), value: "" },
              { label: t("promptsTab.noTopic"), value: "none" },
              ...topics.map((topic) => ({ label: topic.name, value: topic.id })),
            ]}
            size="toolbar"
            value=""
          />
        </div>
      ) : null}
      <div className={panel ? "grid grid-cols-1 items-start gap-4 lg:grid-cols-3" : "min-w-0"}>
        <div className={panel ? "min-w-0 lg:col-span-2" : "min-w-0"}>
          <AiVisibilityPromptsTable
            canWrite={canWrite}
            now={now}
            onSelect={onSelect}
            onSelectionChange={onSelectionChange}
            rows={rows}
            selectedId={selectedId}
            selection={selection}
          />
        </div>
        {panel ? (
          <AiVisibilityPromptPanel
            canWrite={canWrite}
            configuredEngines={selected?.engines ?? []}
            domain={domain}
            now={now}
            enginePrices={enginePrices}
            entities={entities}
            key={panel.promptId}
            onAction={onPromptAction}
            onOpenEvidence={onOpenEvidence}
            onRun={onRunPrompt}
            panel={panel}
          />
        ) : null}
      </div>
    </div>
  );
}
