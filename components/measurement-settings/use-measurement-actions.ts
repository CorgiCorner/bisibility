"use client";
import type { LaunchRankCheckRunActionResult } from "@/lib/actions/rank-check-run-launch-result";
import { useRef, useState } from "react";
import type {
  IntentResult,
  MeasurementPermissions,
  MeasurementPorts,
  MeasurementQuote,
  PaidLaunchCommand,
  PreviewRequest,
  ScheduleIntentCommand,
  SettingsIntentCommand,
} from "./contracts";
import { samePreviewRequest } from "./draft";
export type MeasurementActionState = Readonly<{
  phase:
    | "idle"
    | "previewing"
    | "launching"
    | "saving_schedule"
    | "saving_intent"
    | "launch_unknown"
    | "schedule_unknown"
    | "intent_unknown"
    | "error"
    | "conflict"
    | "blocked"
    | "started"
    | "saved";
  code?: string;
}>;
type Unresolved =
  | { kind: "manual"; command: PaidLaunchCommand }
  | { kind: "schedule"; command: ScheduleIntentCommand }
  | { kind: "intent"; command: SettingsIntentCommand };
export function useMeasurementActions(options: {
  request: PreviewRequest;
  permissions: MeasurementPermissions;
  ports: MeasurementPorts;
  onQuote: (request: PreviewRequest, quote: MeasurementQuote) => void;
  onInvalidate: () => void;
  onStarted: (result: LaunchRankCheckRunActionResult) => void;
  onScheduleResult: (result: IntentResult) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const current = useRef(options);
  current.current = options;
  const busy = useRef(false);
  const unresolved = useRef<Unresolved | null>(null);
  const [state, setState] = useState<MeasurementActionState>({ phase: "idle" });
  function status(value: MeasurementActionState) {
    setState(value);
    current.current.onBusyChange?.(
      unresolved.current !== null ||
        ["previewing", "launching", "saving_schedule", "saving_intent"].includes(value.phase),
    );
  }
  async function preview() {
    const context = current.current;
    if (
      busy.current ||
      unresolved.current ||
      !context.permissions.canRead ||
      !context.permissions.canPreview
    )
      return;
    const request = structuredClone(context.request);
    busy.current = true;
    status({ phase: "previewing" });
    try {
      context.onInvalidate();
      const result = await context.ports.preview(request);
      if (!samePreviewRequest(request, current.current.request)) {
        status({ phase: "idle" });
        return;
      }
      if (
        result.kind === "ready" &&
        current.current.permissions.canRead &&
        current.current.permissions.canPreview
      ) {
        current.current.onQuote(request, result.value);
        status({ phase: "idle" });
      } else
        status({
          phase: result.kind === "conflict" ? "conflict" : "error",
          code: result.kind === "conflict" ? "settings_conflict" : "preview_failed",
        });
    } catch {
      status({ phase: "error", code: "preview_failed" });
    } finally {
      busy.current = false;
    }
  }
  async function launch(command?: Omit<PaidLaunchCommand, "idempotencyKey">) {
    const context = current.current;
    if (
      busy.current ||
      !context.permissions.canRead ||
      !context.permissions.canLaunch ||
      !context.permissions.canPreview ||
      (unresolved.current && unresolved.current.kind !== "manual")
    )
      return;
    if (!unresolved.current) {
      if (!command) return;
      try {
        unresolved.current = {
          kind: "manual",
          command: { ...structuredClone(command), idempotencyKey: crypto.randomUUID() },
        };
      } catch {
        status({ phase: "error", code: "action_failed" });
        return;
      }
    }
    if (unresolved.current.kind !== "manual") return;
    const attempt = unresolved.current;
    busy.current = true;
    status({ phase: "launching" });
    let result: LaunchRankCheckRunActionResult;
    try {
      result = await context.ports.launch(attempt.command);
    } catch {
      status({ phase: "launch_unknown" });
      busy.current = false;
      return;
    }
    busy.current = false;
    unresolved.current = null;
    if ("status" in result && result.status === "not_started") {
      status({ phase: "blocked", code: result.code });
      context.onInvalidate();
    } else if ("outcome" in result) {
      status({
        phase: "blocked",
        code: result.reason === "already_in_progress" ? "duplicate" : "nothing_eligible",
      });
      context.onInvalidate();
    } else {
      status({ phase: "started" });
      context.onStarted(result);
    }
  }
  async function save(
    kind: "schedule" | "intent",
    command?:
      | Omit<ScheduleIntentCommand, "idempotencyKey">
      | Omit<SettingsIntentCommand, "idempotencyKey">,
  ) {
    const context = current.current;
    const allowed =
      kind === "schedule"
        ? context.permissions.canWriteSchedule
        : context.permissions.canWriteIntent;
    if (
      busy.current ||
      !allowed ||
      !context.permissions.canRead ||
      !context.permissions.canPreview ||
      (unresolved.current && unresolved.current.kind !== kind)
    )
      return;
    if (!unresolved.current) {
      if (!command) return;
      try {
        const keyed = { ...structuredClone(command), idempotencyKey: crypto.randomUUID() };
        unresolved.current =
          kind === "schedule"
            ? { kind, command: keyed as ScheduleIntentCommand }
            : { kind, command: keyed as SettingsIntentCommand };
      } catch {
        status({ phase: "error", code: "action_failed" });
        return;
      }
    }
    const attempt = unresolved.current;
    if (attempt.kind !== kind) return;
    busy.current = true;
    status({ phase: kind === "schedule" ? "saving_schedule" : "saving_intent" });
    let result: IntentResult;
    try {
      result =
        attempt.kind === "schedule"
          ? await context.ports.saveSchedule(attempt.command)
          : await context.ports.saveIntent(attempt.command);
    } catch {
      busy.current = false;
      status({ phase: kind === "schedule" ? "schedule_unknown" : "intent_unknown" });
      return;
    }
    busy.current = false;
    if (result.kind === "error" || result.kind === "unconfirmed") {
      status({
        phase: kind === "schedule" ? "schedule_unknown" : "intent_unknown",
        ...(result.kind === "unconfirmed" ? { code: result.code } : {}),
      });
      return;
    }
    unresolved.current = null;
    if (result.kind === "not_saved") status({ phase: "blocked", code: result.code });
    else
      status({
        phase: result.kind === "conflict" ? "conflict" : "saved",
        code: result.kind === "conflict" ? "settings_conflict" : undefined,
      });
    context.onInvalidate();
    context.onScheduleResult(result);
  }
  return {
    state,
    preview,
    launch,
    saveSchedule: (command?: Omit<ScheduleIntentCommand, "idempotencyKey">) =>
      save("schedule", command),
    saveIntent: (command?: Omit<SettingsIntentCommand, "idempotencyKey">) =>
      save("intent", command),
    pending: ["previewing", "launching", "saving_schedule", "saving_intent"].includes(state.phase),
    locked: unresolved.current !== null,
  };
}
