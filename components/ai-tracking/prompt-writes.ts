import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";

export async function saveNewPrompts(input: {
  actions: TrackingWorkspaceActions;
  current: TrackingWorkspaceData;
  refresh: () => void;
  setData: (data: TrackingWorkspaceData) => void;
  texts: readonly string[];
  topicId: string | null;
}) {
  let created = 0;
  let skipped = 0;
  let latest = input.current;
  for (const text of input.texts) {
    try {
      latest = await input.actions.save("prompts", "POST", {
        category: "neutral",
        text,
        topicId: input.topicId,
      });
      created += 1;
    } catch {
      skipped += 1;
    }
  }
  if (created > 0) {
    input.setData(latest);
    input.refresh();
  }
  return { created, skipped };
}

export async function saveNewTopic(input: {
  actions: TrackingWorkspaceActions;
  fallback: string;
  name: string;
  setData: (data: TrackingWorkspaceData) => void;
  setError: (message: string) => void;
}) {
  try {
    const next = await input.actions.save("topics", "POST", {
      description: null,
      name: input.name,
    });
    input.setData(next);
    return [...next.topics].reverse().find((topic) => topic.name === input.name)?.id ?? null;
  } catch (cause) {
    input.setError(cause instanceof Error ? cause.message : input.fallback);
    return null;
  }
}
