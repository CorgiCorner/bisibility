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
        key={`run-${drawer === "run" ? "open" : "closed"}`}
        open={drawer === "run"}
        mutationError={error}
        onCatalog={actions.catalog}
        count={activePrompts.length}
        onClose={() => setDrawer(null)}
        pending={pending}
        onPreview={(configurations, payment) =>
          actions.preview(
            activePrompts.map((prompt) => prompt.id),
            configurations,
            payment,
          )
        }
        onLaunch={async (preview) => {
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
