"use client";

import { AiVisibilityTabs } from "@/components/ai-tracking/AiVisibilityTabs";
import * as aiVisibilityLayout from "@/components/tracking-loading/ai-visibility-layout";
import { Button } from "@/components/ui/Button";
import type { BrandNameSet } from "@/lib/ai-tracking/brand-name-match";
import type { TrackingEngine } from "@/lib/ai-tracking/contract";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import {
  type AiVisibilityPromptsModel,
  promptsCompose,
  promptsSelectedId,
  replacePromptsQuery,
} from "@/lib/ai-tracking/prompts-model";
import { promptProjectionFromWorkspace } from "@/lib/ai-tracking/prompts-page-model";
import { overlayPromptRows } from "@/lib/ai-tracking/prompts-projection";
import {
  type TrackingEnginePriceCard,
  trackingPromptEngines,
  trackingSourceForEngine,
} from "@/lib/ai-tracking/tracking-engines";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AiVisibilityPromptsDrawers } from "./AiVisibilityPromptsDrawers";
import { AiVisibilityPromptsView } from "./AiVisibilityPromptsView";
import { saveNewPrompts, saveNewTopic } from "./prompt-writes";
import { TrackingHistoryPanel } from "./TrackingHistoryPanel";
import { TrackingTopicActions } from "./TrackingTopicActions";
import { useTrackingWorkspace } from "./useTrackingWorkspace";

type RunRequest = { engine: string | null; promptIds: readonly string[] };

export function AiVisibilityPromptsShell({
  actions,
  enginePrices,
  initialData,
  model,
  projectId,
}: Readonly<{
  actions: TrackingWorkspaceActions;
  enginePrices: TrackingEnginePriceCard;
  initialData: TrackingWorkspaceData;
  model: AiVisibilityPromptsModel | null;
  projectId: string;
}>) {
  const t = useTranslations("projectAiTracking");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useTrackingWorkspace(initialData, [], "prompts", actions, null);
  const [runRequest, setRunRequest] = useState<RunRequest | null>(null);
  const {
    activePrompts,
    data,
    editing,
    error,
    pending,
    save,
    selectedSample,
    selection,
    setData,
    setDrawer,
    setEditing,
    setEditingTopic,
    setError,
    setSelectedSample,
    setSelection,
    startTransition,
    drawer,
    editingTopic,
  } = state;
  const compose = promptsCompose(searchParams.get("compose"));
  const view = searchParams.get("view") === "runs" ? "runs" : "prompts";
  const prompted = compose === "run" ? null : runRequest;
  const runIds = [...(prompted?.promptIds ?? activePrompts.map((prompt) => prompt.id))];
  const presetEngine = prompted?.engine;
  const preset =
    presetEngine && trackingPromptEngines().includes(presetEngine as TrackingEngine)
      ? {
          engine: presetEngine as TrackingEngine,
          source: trackingSourceForEngine(presetEngine as TrackingEngine),
        }
      : null;
  const prompts = promptProjectionFromWorkspace(data.prompts, data.schedules);
  const rows =
    model === null ? [] : overlayPromptRows(model.rows, prompts, model.filters, model.entities);
  const panelRow = rows.find((row) => row.id === model?.panel?.promptId);
  const panel =
    model?.panel && panelRow
      ? { ...model.panel, status: panelRow.status, text: panelRow.text }
      : null;
  const topics = data.topics.filter((topic) => topic.status !== "archived");
  const selectedTopic = data.topics.find((topic) => topic.id === model?.filters.topic);
  const ownNames: BrandNameSet | null =
    model?.entities.find((entity) => entity.kind === "project") ?? null;

  function href(change: Parameters<typeof replacePromptsQuery>[2]) {
    return replacePromptsQuery(pathname, searchParams, change);
  }
  const closeCompose = () => router.replace(href({ compose: null }));
  const runOpen = compose === "run" || runRequest !== null;
  const drawers = (
    <AiVisibilityPromptsDrawers
      compose={compose}
      data={data}
      drawer={drawer}
      editing={editing}
      editingTopic={editingTopic}
      error={error}
      enginePrices={enginePrices}
      onCloseCompose={closeCompose}
      onCreatePrompts={(texts, topicId) =>
        saveNewPrompts({
          actions,
          current: data,
          refresh: () => router.refresh(),
          setData,
          texts,
          topicId,
        })
      }
      onCreateTopic={(name) =>
        saveNewTopic({
          actions,
          fallback: t("couldNotSaveChanges"),
          name,
          setData,
          setError,
        })
      }
      onLaunch={async (preview) => {
        setData(await actions.launch(runIds, preview));
        setRunRequest(null);
        router.push(href({ compose: null, view: "runs" }));
      }}
      onPreview={(configurations, payment) => actions.preview(runIds, configurations, payment)}
      onRefresh={() => router.refresh()}
      ownNames={ownNames}
      pending={pending}
      preset={preset}
      projectId={projectId}
      runIds={runIds}
      runOpen={runOpen}
      sample={selectedSample}
      save={save}
      setDrawer={setDrawer}
      setRunRequest={setRunRequest}
      setSample={setSelectedSample}
      topics={topics}
    />
  );
  if (view === "runs") {
    return (
      <>
        <div {...aiVisibilityLayout.aiVisibilityRunsShell}>
          <AiVisibilityTabs
            actions={
              <Button
                component={Link}
                href={href({ compose: null, view: "prompts" })}
                size="sm"
                variant="ghost"
              >
                {t("prompts")}
              </Button>
            }
            active="prompts"
            projectId={projectId}
            promptCount={activePrompts.length}
            trackingView="runs"
          />
          {error ? (
            <p className="m-0 text-sm text-red-text" role="alert">
              {error}
            </p>
          ) : null}
          <TrackingHistoryPanel
            actions={actions}
            data={data}
            initialSamples={[]}
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
            onSelectSample={setSelectedSample}
          />
        </div>
        {drawers}
      </>
    );
  }
  return (
    <>
      <AiVisibilityPromptsView
        activePromptCount={activePrompts.length}
        addHref={href({ compose: "prompt", view: "prompts" })}
        canWrite={data.canWrite}
        now={model?.now ?? "1970-01-01T00:00:00.000Z"}
        domain={ownNames?.domain ?? data.domain}
        enginePrices={enginePrices}
        engines={model?.engines ?? []}
        entities={model?.entities ?? []}
        error={error}
        filters={
          model?.filters ?? {
            engine: null,
            market: null,
            period: "30d",
            promptKind: "all",
            topic: null,
          }
        }
        historyHref={href({ compose: null, view: "runs" })}
        markets={model?.markets ?? []}
        onAssignTopic={(topicId) =>
          startTransition(async () => {
            for (const id of selection) await save("prompts", "PATCH", { topicId }, id);
            setSelection(new Set());
          })
        }
        onBulk={(operation) =>
          startTransition(async () => {
            for (const id of selection) {
              await save(
                "prompts",
                operation === "archive" ? "DELETE" : "PATCH",
                operation === "archive" ? {} : { paused: operation === "pause" },
                id,
              );
            }
            setSelection(new Set());
          })
        }
        onFilter={(filters) => router.push(href({ filters }))}
        onOpenEvidence={setSelectedSample}
        onPromptAction={(id, action) => {
          if (action === "edit") {
            const prompt = data.prompts.find((item) => item.id === id);
            if (!prompt) return;
            setEditing(prompt);
            setDrawer("prompt");
            return;
          }
          startTransition(() =>
            save(
              "prompts",
              action === "archive" ? "DELETE" : "PATCH",
              action === "archive" ? {} : { paused: action === "pause" },
              id,
            ),
          );
        }}
        onRunPrompt={(id, engine) => setRunRequest({ engine, promptIds: [id] })}
        onSelect={(id) => router.push(href({ prompt: id }))}
        onSelectionChange={setSelection}
        panel={panel}
        pending={pending}
        projectId={projectId}
        rows={rows}
        runHref={href({ compose: "run", view: "prompts" })}
        selectedId={promptsSelectedId(searchParams.get("prompt"))}
        selection={selection}
        topicActions={
          selectedTopic ? (
            <TrackingTopicActions
              canWrite={data.canWrite}
              onArchive={() =>
                startTransition(() => save("topics", "DELETE", {}, selectedTopic.id))
              }
              onEdit={() => {
                setEditingTopic(selectedTopic);
                setDrawer("topic");
              }}
              onPause={() =>
                startTransition(() =>
                  save(
                    "topics",
                    "PATCH",
                    { paused: selectedTopic.status !== "paused" },
                    selectedTopic.id,
                  ),
                )
              }
              topic={selectedTopic}
            />
          ) : null
        }
        topics={topics}
        truncated={model?.truncated ?? false}
      />
      {drawers}
    </>
  );
}
