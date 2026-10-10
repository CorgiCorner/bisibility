"use client";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Pill } from "@/components/ui/Pill";
import type {
  TrackingSampleRow,
  TrackingWorkspaceData,
} from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { useTranslations } from "next-intl";
import { TrackingBulkActions } from "./TrackingBulkActions";
import { TrackingGeneration } from "./TrackingGeneration";
import { TrackingHistoryPanel } from "./TrackingHistoryPanel";
import { TrackingMetrics } from "./TrackingMetrics";
import { TrackingPromptTable } from "./TrackingPromptTable";
import { TrackingSchedules } from "./TrackingSchedules";
import { TrackingSuggestions } from "./TrackingSuggestions";
import { TrackingTopicActions } from "./TrackingTopicActions";
import { TrackingWorkspaceDrawers } from "./TrackingWorkspaceDrawers";
import { useTrackingWorkspace } from "./useTrackingWorkspace";

export type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
export function AiTrackingWorkspace({
  initialData,
  actions,
  initialSamples = [],
  initialTab = "prompts",
  shellOwnsHeading = false,
}: Readonly<{
  initialData: TrackingWorkspaceData;
  actions: TrackingWorkspaceActions;
  initialSamples?: TrackingSampleRow[];
  initialTab?: "prompts" | "runs" | "schedules";
  shellOwnsHeading?: boolean;
}>) {
  const t = useTranslations("projectAiTracking");
  const state = useTrackingWorkspace(initialData, initialSamples, initialTab, actions);
  const {
    data,
    setData,
    tab,
    setTab,
    selection,
    setSelection,
    topic,
    setTopic,
    setDrawer,
    setEditingSchedule,
    setEditingTopic,
    setDraft,
    setEditing,
    setSelectedSample,
    error,
    setError,
    pending,
    startTransition,
    activePrompts,
    visiblePrompts,
    save,
  } = state;
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {!shellOwnsHeading && (
            <h1 className="m-0 text-[21px] font-semibold">{t("aiTracking")}</h1>
          )}
          <p className="mt-2 text-sm text-fg-muted">
            {t("trackTheQuestionsThatMatterWithEvidenceYou")}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {t("projectTrackingMeta", { domain: data.domain, count: activePrompts.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!data.canWrite}
            onClick={() => {
              setEditingTopic(undefined);
              setDrawer("topic");
            }}
          >
            {t("addTopic")}
          </Button>
          <Button
            disabled={!data.canWrite}
            onClick={() => {
              setEditing(undefined);
              setDraft(undefined);
              setDrawer("prompt");
            }}
          >
            {t("addPrompt")}
          </Button>
        </div>
      </header>
      <TrackingMetrics data={data} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-bg-elev p-3">
        <nav aria-label={t("trackingViews")} className="flex flex-wrap gap-2">
          {(["prompts", "runs", "schedules"] as const).map((view) => (
            <Pill key={view} active={tab === view} onClick={() => setTab(view)}>
              {view === "prompts"
                ? t("prompts")
                : view === "runs"
                  ? t("runHistory")
                  : t("schedules")}
            </Pill>
          ))}
        </nav>
        <Button
          size="sm"
          variant="secondary"
          disabled={!activePrompts.length || !data.canWrite}
          onClick={() => setDrawer("run")}
        >
          {t("previewRun")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-card border border-border p-3 text-sm text-red-text">
          {error}
        </p>
      )}
      {tab === "prompts" && (
        <section className="space-y-3">
          <TrackingSuggestions
            canWrite={data.canWrite}
            onSuggest={actions.suggest}
            onReview={(text, category) => {
              setEditing(undefined);
              setDraft({ text, category });
              setDrawer("prompt");
            }}
          />
          <TrackingGeneration
            actions={actions.generation}
            onCatalog={actions.catalog}
            canWrite={data.canWrite}
            onReviewDraft={(draft) => {
              setEditing(undefined);
              setDraft(draft);
              setDrawer("prompt");
            }}
          />
          <div className="flex items-center gap-3">
            <MenuSelect
              ariaLabel={t("filterByTopic")}
              value={topic}
              onChange={setTopic}
              options={[
                { value: "all", label: t("allTopics") },
                ...data.topics.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
            <span className="text-xs text-fg-muted">
              {t("promptCount", { count: visiblePrompts.length })}
            </span>
          </div>
          <TrackingTopicActions
            topic={data.topics.find((item) => item.id === topic)}
            canWrite={data.canWrite}
            onEdit={() => {
              setEditingTopic(data.topics.find((item) => item.id === topic));
              setDrawer("topic");
            }}
            onPause={() =>
              startTransition(() =>
                save(
                  "topics",
                  "PATCH",
                  { paused: data.topics.find((item) => item.id === topic)?.status !== "paused" },
                  topic,
                ),
              )
            }
            onArchive={() => startTransition(() => save("topics", "DELETE", {}, topic))}
          />
          {selection.size > 0 && (
            <TrackingBulkActions
              count={selection.size}
              pending={pending}
              onAction={(operation) =>
                startTransition(async () => {
                  for (const id of selection)
                    await save(
                      "prompts",
                      operation === "archive" ? "DELETE" : "PATCH",
                      operation === "archive" ? {} : { paused: operation === "pause" },
                      id,
                    );
                  setSelection(new Set());
                })
              }
            />
          )}
          <TrackingPromptTable
            selection={selection}
            onSelectionChange={setSelection}
            prompts={visiblePrompts}
            canWrite={data.canWrite}
            onEdit={(prompt) => {
              setEditing(prompt);
              setDrawer("prompt");
            }}
            onArchive={(prompt) => startTransition(() => save("prompts", "DELETE", {}, prompt.id))}
          />
          <p className="text-xs leading-5 text-fg-muted">
            {t("consumerScraperModelAPIAndGoogleAIOverview")}
          </p>
        </section>
      )}
      {tab === "runs" && (
        <TrackingHistoryPanel
          data={data}
          actions={actions}
          initialSamples={initialSamples}
          onSelectSample={setSelectedSample}
          onCancel={(id) =>
            startTransition(async () => {
              try {
                setData(await actions.cancel(id));
                setError(null);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t("cancelFailed"));
              }
            })
          }
        />
      )}
      {tab === "schedules" && (
        <TrackingSchedules
          schedules={data.schedules}
          canWrite={data.canWrite}
          onCreate={() => {
            setEditingSchedule(undefined);
            setDrawer("schedule");
          }}
          onEdit={(schedule) => {
            setEditingSchedule(schedule);
            setDrawer("schedule");
          }}
          onArchive={(id) => startTransition(() => save("schedules", "DELETE", {}, id))}
        />
      )}
      <TrackingWorkspaceDrawers state={state} actions={actions} />
    </div>
  );
}
