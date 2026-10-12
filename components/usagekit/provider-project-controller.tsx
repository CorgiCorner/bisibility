"use client";
import type { ProviderFeedbackLabels } from "@/components/usagekit/provider-feedback";
import type { ReactNode } from "react";
import { useCallback, useMemo, useSyncExternalStore } from "react";
export type ProjectChainEntry = { id: string; label: string; enabled: boolean; revision: string };
export type ProjectChainSnapshot = {
  identity: string;
  revision: string;
  entries: readonly ProjectChainEntry[];
};
export type ProjectChainCommand = {
  commandId: string;
  expectedRevision: string;
  entries: readonly { id: string; enabled: boolean; expectedRevision: string }[];
};
export type ProjectChainResult = {
  commandId: string;
  outcome: "success" | "conflict" | "forbidden" | "invalid" | "unavailable" | "not_applied";
  ambiguous?: boolean;
};
export type ProjectChainProps = {
  mode: "project";
  /** identity includes the project and verified host authorization scope. */
  snapshot: ProjectChainSnapshot;
  evidence: ProjectChainSnapshot | null;
  canEdit: boolean;
  /** Hide editing actions for readers; temporary write fences keep controls visible. */
  showControls?: boolean;
  onCommit: (command: ProjectChainCommand) => Promise<ProjectChainResult>;
  onReconcile?: (command: ProjectChainCommand) => Promise<ProjectChainResult>;
  onReload?: () => Promise<ProjectChainSnapshot | null>;
  onSaved?: (result: ProjectChainResult) => void;
  formatPosition?: (entry: ProjectChainEntry, index: number, count: number) => ReactNode;
  /** Number of enabled entries in the current draft. */
  formatCount?: (count: number) => ReactNode;
  variant?: "card" | "plain";
  labels?: Partial<ProviderChainLabels>;
  feedbackLabels?: Partial<ProviderFeedbackLabels>;
};
type State = {
  base: ProjectChainSnapshot;
  draft: readonly ProjectChainEntry[];
  command: ProjectChainCommand | null;
  result: ProjectChainResult | null;
  pending: boolean;
  ambiguous: boolean;
  notice: "not_applied" | null;
};
type Controller = { state: State; listeners: Set<() => void>; supplied: string };
// Content-free state survives modal remounts. Hosts retain the journal across page reloads.
const controllers = new Map<string, Controller>();
/** Recover only unfinished work within the same verified host authorization identity. */
export function recoverProjectChainSnapshot(identity: string): ProjectChainSnapshot | null {
  const state = typeof window === "undefined" ? undefined : controllers.get(identity)?.state;
  return state && (state.pending || state.ambiguous) ? structuredClone(state.base) : null;
}
const revisionKey = (snapshot: ProjectChainSnapshot) =>
  JSON.stringify([
    snapshot.revision,
    snapshot.entries.map((row) => [row.id, row.revision]).sort(([a], [b]) => a!.localeCompare(b!)),
  ]);
function freshController(snapshot: ProjectChainSnapshot): Controller {
  return {
    state: {
      base: structuredClone(snapshot),
      draft: structuredClone(snapshot.entries),
      command: null,
      result: null,
      pending: false,
      ambiguous: false,
      notice: null,
    },
    listeners: new Set(),
    supplied: revisionKey(snapshot),
  };
}
function controller(snapshot: ProjectChainSnapshot, canReload: boolean): Controller {
  // A server request must never read or populate the browser's modal journal.
  if (typeof window === "undefined") return freshController(snapshot);
  let c = controllers.get(snapshot.identity);
  if (!c) {
    c = freshController(snapshot);
    controllers.set(snapshot.identity, c);
    if (controllers.size > 100)
      for (const [key, value] of controllers) {
        if (controllers.size <= 100) break;
        if (
          key !== snapshot.identity &&
          !value.listeners.size &&
          !value.state.pending &&
          !value.state.ambiguous
        )
          controllers.delete(key);
      }
  } else if (!c.state.pending && !c.state.ambiguous && c.supplied !== revisionKey(snapshot)) {
    const sameBase = revisionKey(snapshot) === revisionKey(c.state.base);
    const clean = JSON.stringify(c.state.draft) === JSON.stringify(c.state.base.entries);
    const terminal = ["conflict", "forbidden"].includes(c.state.result?.outcome ?? "");
    const membershipChanged =
      JSON.stringify(snapshot.entries.map((row) => row.id).sort()) !==
      JSON.stringify(c.state.base.entries.map((row) => row.id).sort());
    // Keep deferred props available when the user undoes an unsaved draft.
    if (sameBase || clean || (!canReload && (terminal || membershipChanged))) {
      c.supplied = revisionKey(snapshot);
      if (!sameBase)
        c.state = {
          ...freshController(snapshot).state,
          notice: terminal || !clean ? "not_applied" : c.state.notice,
        };
    }
  }
  return c;
}
function publish(c: Controller, change: Partial<State>) {
  c.state = { ...c.state, ...change };
  c.listeners.forEach((fn) => {
    fn();
  });
}
/** One complete command, stable draft revisions, and explicit original-command recovery. */
export function useProjectChainController(props: ProjectChainProps) {
  const c = controller(props.snapshot, !!props.onReload);
  const subscription = useMemo(() => ({ active: false, listeners: c.listeners }), [c]);
  const subscribe = useCallback(
    (fn: () => void) => {
      subscription.active = true;
      subscription.listeners.add(fn);
      return () => {
        subscription.active = false;
        subscription.listeners.delete(fn);
      };
    },
    [subscription],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => c.state,
    () => c.state,
  );
  const evidence = props.evidence;
  const ids = state.base.entries.map((r) => r.id);
  const valid =
    new Set(ids).size === ids.length &&
    evidence?.identity === state.base.identity &&
    evidence.entries.length === ids.length &&
    new Set(evidence.entries.map((r) => r.id)).size === ids.length &&
    evidence.entries.every((r) => ids.includes(r.id));
  const editable =
    props.canEdit &&
    valid &&
    !state.pending &&
    !state.ambiguous &&
    !["conflict", "forbidden", "success"].includes(state.result?.outcome ?? "");
  const run = async (reconcile: boolean) => {
    if (c.state.pending || (reconcile ? !c.state.ambiguous || !props.onReconcile : !editable))
      return;
    const command = reconcile
      ? c.state.command
      : {
          commandId: crypto.randomUUID(),
          expectedRevision: state.base.revision,
          entries: [
            ...state.draft.filter((r) => r.enabled),
            ...state.draft.filter((r) => !r.enabled),
          ].map((row) => ({
            id: row.id,
            enabled: row.enabled,
            expectedRevision: row.revision,
          })),
        };
    if (!command) return;
    publish(c, { command, pending: true, notice: null });
    let result: ProjectChainResult;
    try {
      result = await (reconcile ? props.onReconcile!(command) : props.onCommit(command));
    } catch {
      result = { commandId: command.commandId, outcome: "unavailable", ambiguous: true };
    }
    if (result.commandId !== command.commandId)
      result = { commandId: command.commandId, outcome: "unavailable", ambiguous: true };
    const ambiguous = reconcile
      ? !["success", "conflict", "not_applied"].includes(result.outcome)
      : result.outcome === "unavailable" && result.ambiguous !== false;
    publish(c, {
      pending: false,
      ambiguous,
      result,
      ...(result.outcome === "not_applied" ? { command: null } : {}),
    });
    if (result.outcome === "success") {
      const entries = command.entries.map(
        (row) => c.state.draft.find((entry) => entry.id === row.id)!,
      );
      publish(c, { base: { ...c.state.base, entries }, draft: entries });
      // An unmounted modal must not close a new modal on a late result.
      if (subscription.active) props.onSaved?.(result);
    }
  };
  const reload = async () => {
    if (c.state.pending || c.state.ambiguous || !props.onReload) return;
    publish(c, { pending: true });
    try {
      const snapshot = await props.onReload();
      if (snapshot?.identity === state.base.identity) {
        // Unchanged parent props must not undo an explicit reload's fresher base.
        c.supplied = revisionKey(props.snapshot);
        publish(c, {
          base: structuredClone(snapshot),
          draft: structuredClone(snapshot.entries),
          command: null,
          result: null,
          notice: null,
        });
      }
    } catch {
      // A failed read cannot discard the draft or alter an earlier command result.
    } finally {
      publish(c, { pending: false });
    }
  };
  const change = (draft: readonly ProjectChainEntry[]) => {
    if (
      editable &&
      draft.length === ids.length &&
      new Set(draft.map((r) => r.id)).size === ids.length &&
      draft.every((r) => ids.includes(r.id))
    )
      publish(c, { draft, notice: null });
  };
  return { ...state, editable, change, save: () => run(false), reconcile: () => run(true), reload };
}

export const providerChainLabels = {
  title: "Fallback order",
  description:
    "The host decides when fallback is allowed. This changes the explicit connection order only.",
  up: "Move up",
  down: "Move down",
  add: "Add to fallback",
  remove: "Remove from fallback",
  save: "Save fallback order",
  enable: "Enable",
  disable: "Disable",
  enabled: "Enabled",
  disabled: "Disabled",
  empty: "No fallback connections selected.",
  first: "First",
  next: "Next",
  paused: "Paused",
  reload: "Reload order",
  invalid: "The complete connection set is required.",
};
export type ProviderChainLabels = typeof providerChainLabels;
