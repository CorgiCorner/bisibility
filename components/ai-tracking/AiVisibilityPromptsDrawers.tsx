"use client";

import { aiVisibilityTabHref } from "@/lib/ai-tracking/ai-visibility-paths";
import type { BrandNameSet } from "@/lib/ai-tracking/brand-name-match";
import type { TrackingEngine, TrackingSource } from "@/lib/ai-tracking/contract";
import type {
  TrackingPreview,
  TrackingPromptRow,
  TrackingSampleRow,
  TrackingWorkspaceData,
} from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import type { TrackingEnginePriceCard } from "@/lib/ai-tracking/tracking-engines";
import { AiVisibilityAddPromptDialog } from "./AiVisibilityAddPromptDialog";
import { TrackingEvidenceDrawer } from "./TrackingEvidenceDrawer";
import { TrackingPromptDrawer } from "./TrackingPromptDrawer";
import { TrackingRunDrawer } from "./TrackingRunDrawer";
import { TrackingTopicDrawer } from "./TrackingTopicDrawer";

export function AiVisibilityPromptsDrawers({
  compose,
  data,
  drawer,
  editing,
  editingTopic,
  error,
  enginePrices,
  onCloseCompose,
  onCreatePrompts,
  onCreateTopic,
  onLaunch,
  onPreview,
  onRefresh,
  ownNames,
  pending,
  preset,
  projectId,
  runIds,
  runOpen,
  sample,
  save,
  setDrawer,
  setRunRequest,
  setSample,
  topics,
}: Readonly<{
  compose: "prompt" | "run" | null;
  data: TrackingWorkspaceData;
  drawer: "prompt" | "topic" | "run" | null;
  editing: TrackingPromptRow | undefined;
  editingTopic: TrackingWorkspaceData["topics"][number] | undefined;
  error: string | null;
  enginePrices: TrackingEnginePriceCard;
  onCloseCompose: () => void;
  onLaunch: (preview: TrackingPreview) => Promise<void>;
  onPreview: (
    configurations: Parameters<TrackingWorkspaceActions["preview"]>[1],
    payment?: Parameters<TrackingWorkspaceActions["preview"]>[2],
  ) => ReturnType<TrackingWorkspaceActions["preview"]>;
  onCreatePrompts: (
    texts: readonly string[],
    topicId: string | null,
  ) => Promise<{ created: number; skipped: number }>;
  onCreateTopic: (name: string) => Promise<string | null>;
  onRefresh: () => void;
  ownNames: BrandNameSet | null;
  pending: boolean;
  preset: { engine: TrackingEngine; source: TrackingSource } | null;
  projectId: string;
  runIds: readonly string[];
  runOpen: boolean;
  sample: TrackingSampleRow | null;
  save: (
    resource: "prompts" | "schedules" | "topics",
    method: "DELETE" | "PATCH" | "POST",
    input: unknown,
    member?: string,
  ) => Promise<void>;
  setDrawer: (drawer: "prompt" | "topic" | "run" | null) => void;
  setRunRequest: (request: { engine: string | null; promptIds: readonly string[] } | null) => void;
  setSample: (sample: TrackingSampleRow | null) => void;
  topics: readonly { id: string; name: string }[];
}>) {
  return (
    <>
      <AiVisibilityAddPromptDialog
        enabledEngines={data.enabledEngines ?? [{ engine: "chat_gpt", source: "consumer_scrape" }]}
        enginePrices={enginePrices}
        enginesHref={aiVisibilityTabHref(projectId, "engines")}
        error={error}
        existingTexts={data.prompts.map((prompt) => prompt.text)}
        onClose={onCloseCompose}
        onCreate={({ texts, topicId }) => onCreatePrompts(texts, topicId)}
        onCreateTopic={onCreateTopic}
        open={compose === "prompt"}
        ownNames={ownNames}
        topics={topics}
      />
      <TrackingPromptDrawer
        error={error}
        key={`prompt-${editing?.id ?? "closed"}`}
        onClose={() => setDrawer(null)}
        onSave={async (input) => {
          await save("prompts", "PATCH", input, editing?.id);
          onRefresh();
        }}
        open={drawer === "prompt" && Boolean(editing)}
        pending={pending}
        prompt={editing}
        topics={data.topics}
      />
      <TrackingTopicDrawer
        error={error}
        key={`topic-${editingTopic?.id ?? "closed"}`}
        onClose={() => setDrawer(null)}
        onSave={async (input) => {
          await save("topics", editingTopic ? "PATCH" : "POST", input, editingTopic?.id);
        }}
        open={drawer === "topic"}
        pending={pending}
        topic={editingTopic}
      />
      <TrackingRunDrawer
        count={runIds.length}
        key={`${compose ?? "none"}-${preset?.engine ?? "default"}-${runIds.join(",")}`}
        onClose={() => {
          setRunRequest(null);
          if (compose === "run") onCloseCompose();
        }}
        onLaunch={onLaunch}
        onPreview={onPreview}
        open={runOpen}
        pending={pending}
        engineDefault={data.engineDefault}
        preset={preset}
      />
      <TrackingEvidenceDrawer onClose={() => setSample(null)} sample={sample} />
    </>
  );
}
