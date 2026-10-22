import type { ProjectRunAttention, ProjectRunLifecycle } from "./project-run";

export const AI_RUN_STATUS_KEYS = [
  "planned",
  "running",
  "completed",
  "partial",
  "blocked",
  "failed",
  "cancelled",
  "skipped",
  "cost_limit_exceeded",
  "status_unavailable",
] as const;
export const AI_STORED_TERMINAL_STATES = [
  "completed",
  "partial",
  "failed",
  "cancelled",
  "skipped",
] as const;
export const AI_QUIET_STATES = ["planned", "running", "completed", "cancelled"] as const;
export const AI_STORED_ATTENTION_STATES = ["partial", "blocked", "failed", "skipped"] as const;
export const AI_TERMINAL_STATES = [...AI_STORED_TERMINAL_STATES, "cost_limit_exceeded"] as const;
export const AI_ATTENTION_STATES = [
  ...AI_STORED_ATTENTION_STATES,
  "cost_limit_exceeded",
  "status_unavailable",
] as const;
export const AI_COST_SKIP_REASONS = ["cost_limit_exceeded", "budget_exhausted"] as const;
export type AiRunStatusKey = (typeof AI_RUN_STATUS_KEYS)[number];

/** Read policy only. Every skipped measurement remains visible for review, including future cost-limit skips. */
export function aiRunState(
  state: string,
  finishedAt: Date | string | null,
  reason?: string | null,
) {
  const status = (AI_RUN_STATUS_KEYS as readonly string[]).includes(state)
    ? (state as AiRunStatusKey)
    : "status_unavailable";
  const costLimit =
    state === "skipped" && (AI_COST_SKIP_REASONS as readonly string[]).includes(reason ?? "");
  const key: AiRunStatusKey = costLimit ? "cost_limit_exceeded" : status;
  const terminal = Boolean(finishedAt) || (AI_TERMINAL_STATES as readonly string[]).includes(key);
  const attention: ProjectRunAttention | null = (AI_ATTENTION_STATES as readonly string[]).includes(
    key,
  )
    ? {
        kind:
          key === "failed"
            ? "failed"
            : key === "cost_limit_exceeded"
              ? "cost_limit_exceeded"
              : "blocked",
        message: reason ?? null,
      }
    : null;
  return {
    key,
    attention,
    group: terminal ? (2 as const) : key === "running" ? (0 as const) : (1 as const),
    lifecycle: status as ProjectRunLifecycle,
  };
}
