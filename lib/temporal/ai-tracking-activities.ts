import "server-only";
import type { SamplePlan } from "../ai-tracking/contract";
import { runTrackingSample } from "../ai-tracking/execution/runtime";
import { planDueTrackingSchedules } from "../ai-tracking/scheduling/sweep";
import { cancelTrackingRun } from "../ai-tracking/stores/runs";
import { prisma } from "../db/prisma";
import type { AiTrackingProgress, AiTrackingWorkflowInput } from "./ai-tracking-contract";

export async function collectAiTrackingRunActivity(
  input: AiTrackingWorkflowInput,
): Promise<AiTrackingProgress> {
  if (input.collectionOnly) await cancelTrackingRun(input.projectId, input.runId);
  const samples = await prisma.aiTrackingSample.findMany({
    where: {
      projectId: input.projectId,
      runId: input.runId,
      dispatch: { not: "terminal" },
      ...(input.collectionOnly ? { providerTaskId: { not: null } } : {}),
    },
    orderBy: { id: "asc" },
  });
  let pending = 0;
  let unknown = 0;
  let terminal = 0;
  let deadline: string | null = null;
  for (const sample of samples) {
    const plan = sample.plan as unknown as SamplePlan;
    deadline = new Date(
      Math.min(Date.parse(plan.deadline), deadline ? Date.parse(deadline) : Infinity),
    ).toISOString();
    try {
      const state = await runTrackingSample(input.projectId, sample.id, {
        forceCollection: input.collectionOnly,
      });
      if (state === "submission_unknown") unknown += 1;
      else if (state === "terminal") terminal += 1;
      else if (state !== "blocked") pending += 1;
    } catch {
      pending += 1;
    }
  }
  return { pending, unknown, terminal, deadline };
}
export async function planAiTrackingSchedulesActivity() {
  return planDueTrackingSchedules();
}
