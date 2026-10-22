import type { Prisma } from "@/lib/generated/prisma/client";
import { AI_COST_SKIP_REASONS, AI_QUIET_STATES, AI_STORED_TERMINAL_STATES } from "./ai-run-state";
import type { ProjectRunsStatus } from "./filters";

export function aiStatusWhere(status: ProjectRunsStatus): Prisma.AiTrackingRunWhereInput {
  const costReason = {
    OR: AI_COST_SKIP_REASONS.map((reason) => ({
      samples: { some: { evidence: { path: ["providerStatus"], equals: reason } } },
    })),
  };
  if (status === "all") return {};
  if (status === "attention") return { NOT: { state: { in: [...AI_QUIET_STATES] } } };
  if (status === "active") return { state: "running" };
  if (status === "finished")
    return {
      OR: [{ state: { in: [...AI_STORED_TERMINAL_STATES] } }, { finishedAt: { not: null } }],
    };
  if (status === "cost_limit_exceeded") return { state: "skipped", ...costReason };
  if (status === "skipped") return { state: "skipped", NOT: costReason };
  if (
    [
      "planned",
      "running",
      "completed",
      "partial",
      "blocked",
      "failed",
      "cancelled",
      "skipped",
    ].includes(status)
  )
    return {
      state: status as
        | "planned"
        | "running"
        | "completed"
        | "partial"
        | "blocked"
        | "failed"
        | "cancelled"
        | "skipped",
    };
  return { id: { in: [] } };
}
