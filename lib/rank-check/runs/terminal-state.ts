import { runOutcomeSchema, runStatusSchema } from "./contract";

/** Older finalizers stored cancellation as an outcome, outside the public contract. */
export function normalizeTerminalRunState(input: { status: string; outcome: string | null }) {
  if (
    (input.status === "completed" || input.status === "cancelled") &&
    input.outcome === "cancelled"
  ) {
    return { status: "cancelled" as const, outcome: null };
  }
  return {
    status: runStatusSchema.parse(input.status),
    outcome: runOutcomeSchema.nullable().parse(input.outcome),
  };
}
