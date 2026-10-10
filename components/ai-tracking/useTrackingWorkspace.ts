"use client";
import type {
  TrackingPromptDraft,
  TrackingPromptRow,
  TrackingSampleRow,
  TrackingWorkspaceData,
} from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
export function useTrackingWorkspace(
  initialData: TrackingWorkspaceData,
  initialSamples: TrackingSampleRow[],
  initialTab: "prompts" | "runs" | "schedules",
  actions: TrackingWorkspaceActions,
) {
  const t = useTranslations("projectAiTracking");
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState(initialTab);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [topic, setTopic] = useState("all");
  const [drawer, setDrawer] = useState<"prompt" | "topic" | "run" | "schedule" | null>(null);
  const [editingTopic, setEditingTopic] = useState<
    TrackingWorkspaceData["topics"][number] | undefined
  >();
  const [editingSchedule, setEditingSchedule] = useState<
    TrackingWorkspaceData["schedules"][number] | undefined
  >();
  const [draft, setDraft] = useState<TrackingPromptDraft | undefined>();
  const [editing, setEditing] = useState<TrackingPromptRow | undefined>();
  const [samples, setSamples] = useState(initialSamples);
  const [selectedSample, setSelectedSample] = useState<TrackingSampleRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const activePrompts = data.prompts.filter((prompt) => prompt.status === "active");
  const visiblePrompts = data.prompts.filter(
    (prompt) => topic === "all" || prompt.topicId === topic,
  );
  async function save(
    resource: "topics" | "prompts" | "schedules",
    method: "POST" | "PATCH" | "DELETE",
    input: unknown,
    member?: string,
  ) {
    setError(null);
    try {
      setData(await actions.save(resource, method, input, member));
      setDrawer(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("couldNotSaveChanges"));
    }
  }

  return {
    data,
    setData,
    tab,
    setTab,
    selection,
    setSelection,
    topic,
    setTopic,
    drawer,
    setDrawer,
    editingSchedule,
    setEditingSchedule,
    editingTopic,
    setEditingTopic,
    draft,
    setDraft,
    editing,
    setEditing,
    samples,
    setSamples,
    selectedSample,
    setSelectedSample,
    error,
    setError,
    pending,
    startTransition,
    activePrompts,
    visiblePrompts,
    save,
  };
}
