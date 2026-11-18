"use client";

import { ASSISTANT_EFFORTS, type AssistantEffort } from "@/lib/assistant/effort";
import { useSyncExternalStore } from "react";

/**
 * The model, effort and token limit last picked in the composer. Kept in local client state (this
 * browser's localStorage, one entry per project), not on the server: it is a convenience, and the
 * server still validates every turn's model, effort and limit against the current catalog.
 * A null token limit means the model's own maximum.
 */
export type AssistantSelection = {
  modelId: string | null;
  effort: AssistantEffort | null;
  maxOutputTokens: number | null;
};

const EMPTY: AssistantSelection = { modelId: null, effort: null, maxOutputTokens: null };
const memory = new Map<string, AssistantSelection>();
const listeners = new Set<() => void>();

export function assistantSelectionKey(project: string) {
  return `bv:assistant-selection:${project}:v1`;
}

export function parseAssistantSelection(raw: string | null): AssistantSelection {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as {
      modelId?: unknown;
      effort?: unknown;
      maxOutputTokens?: unknown;
    };
    const modelId =
      typeof value.modelId === "string" && value.modelId.length > 0 && value.modelId.length <= 100
        ? value.modelId
        : null;
    const effort = ASSISTANT_EFFORTS.find((item) => item === value.effort) ?? null;
    const limit = value.maxOutputTokens;
    const maxOutputTokens =
      typeof limit === "number" && Number.isSafeInteger(limit) && limit > 0 && limit <= 10_000_000
        ? limit
        : null;
    return { modelId, effort, maxOutputTokens };
  } catch {
    return EMPTY;
  }
}

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function snapshot(key: string) {
  const known = memory.get(key);
  if (known) return known;
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(key) ?? null;
  } catch {
    raw = null;
  }
  const value = parseAssistantSelection(raw);
  memory.set(key, value);
  return value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed a stored pick: drop the cached copy so the next read sees it.
  const onStorage = (event: StorageEvent) => {
    if (!event.key || !memory.has(event.key)) return;
    memory.delete(event.key);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeAssistantSelection(project: string, patch: Partial<AssistantSelection>) {
  const key = assistantSelectionKey(project);
  const next = { ...snapshot(key), ...patch };
  memory.set(key, next);
  try {
    storage()?.setItem(key, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the pick still holds for this page session.
  }
  for (const listener of listeners) listener();
}

/** Test seam: forget cached picks so a test reads storage again. */
export function resetAssistantSelectionCache() {
  memory.clear();
}

export function useAssistantSelection(project: string) {
  const key = assistantSelectionKey(project);
  const selection = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => EMPTY,
  );
  return [
    selection,
    (patch: Partial<AssistantSelection>) => writeAssistantSelection(project, patch),
  ] as const;
}
