"use client";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { TrackingEvidenceDrawer } from "./TrackingEvidenceDrawer";
import { TrackingPromptDrawer } from "./TrackingPromptDrawer";
import { TrackingRunDrawer } from "./TrackingRunDrawer";
import { TrackingTopicDrawer } from "./TrackingTopicDrawer";
import type { useTrackingWorkspace } from "./useTrackingWorkspace";
export function TrackingWorkspaceDrawers({
  state,
  actions,
}: Readonly<{
  state: ReturnType<typeof useTrackingWorkspace>;
  actions: TrackingWorkspaceActions;
}>) {
  const {
    drawer,
    setDrawer,
    editing,
    draft,
    error,
    data,
    pending,
    save,
    editingTopic,
    editingSchedule,
    activePrompts,
    setData,
    setTab,
    selectedSample,
    setSelectedSample,
  } = state;
  return (
    <>
      <TrackingPromptDrawer
        key={`prompt-${editing?.id ?? (drawer === "prompt" ? "new-open" : "closed")}`}
        open={drawer === "prompt"}
        error={error}
        prompt={editing}
        draft={draft}
        topics={data.topics}
        onClose={() => setDrawer(null)}
        pending={pending}
        onSave={async (input) => {
          await save("prompts", editing ? "PATCH" : "POST", input, editing?.id);
        }}
      />
      <TrackingTopicDrawer
        error={error}
        topic={editingTopic}
        key={`topic-${drawer === "topic" ? (editingTopic?.id ?? "open") : "closed"}`}
        open={drawer === "topic"}
        onClose={() => setDrawer(null)}
        pending={pending}
        onSave={async (input) => {
          await save("topics", editingTopic ? "PATCH" : "POST", input, editingTopic?.id);
        }}
      />
      <TrackingRunDrawer
        key={`run-${drawer === "run" || drawer === "schedule" ? (editingSchedule?.id ?? drawer) : "closed"}`}
        open={drawer === "run" || drawer === "schedule"}
        scheduleMode={drawer === "schedule"}
        schedule={editingSchedule}
        mutationError={error}
        onCatalog={actions.catalog}
        count={editingSchedule?.promptIds?.length ?? activePrompts.length}
        onClose={() => setDrawer(null)}
        pending={pending}
        onSaveMetadata={(metadata) => save("schedules", "PATCH", metadata, editingSchedule?.id)}
        onPreview={(configurations) =>
          actions.preview(
            editingSchedule?.promptIds ?? activePrompts.map((prompt) => prompt.id),
            configurations,
          )
        }
        onLaunch={async (preview, schedule) => {
          if (schedule) {
            await save(
              "schedules",
              editingSchedule ? "PATCH" : "POST",
              {
                ...schedule,
                consent: schedule.enabled,
                configuration: {
                  ...preview,
                  promptIds: editingSchedule?.promptIds ?? activePrompts.map((prompt) => prompt.id),
                  idempotencyKey: crypto.randomUUID(),
                  origin: "manual",
                  entrySource: "app",
                  deadline: new Date(Date.now() + 86_400_000).toISOString(),
                },
              },
              editingSchedule?.id,
            );
            return;
          }
          setData(
            await actions.launch(
              activePrompts.map((prompt) => prompt.id),
              preview,
            ),
          );
          setDrawer(null);
          setTab("runs");
        }}
      />
      <TrackingEvidenceDrawer sample={selectedSample} onClose={() => setSelectedSample(null)} />
    </>
  );
}
