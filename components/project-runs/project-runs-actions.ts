"use server";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { getRankCheckRunCommand } from "@/lib/queries/rank-check-runs";
import { skipRankCheckRunCommand } from "@/lib/rank-check/runs/cancel-run";
import { runRankCheckRunNowCommand } from "@/lib/rank-check/runs/run-now";
import { asProjectRef } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const inputSchema = z
  .object({
    projectRef: z.string().trim().min(1).max(120),
    runId: z.string().trim().min(1).max(120),
  })
  .strict();
const runsRoute = projectRunsPath(asProjectRef("[project]"));

async function plannedRun(input: unknown) {
  const data = inputSchema.parse(input);
  if (!isPublicIdOfType(data.runId, "rcr")) throw new Error("Rank-check run not found.");
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectRef, { type: "keyword" });
  const run = await getRankCheckRunCommand(project.id, data.runId);
  return { actor, data, project, run };
}

export async function runPlannedProjectRunNow(input: unknown) {
  const { actor, data, project, run } = await plannedRun(input);
  await runRankCheckRunNowCommand({
    actorId: actor.id,
    orchestrationWorkflowId: run.orchestrationWorkflowId,
    projectId: project.id,
    publicId: data.runId,
    runId: run.id,
  });
  revalidatePath(runsRoute, "page");
}

export async function skipPlannedProjectRun(input: unknown) {
  const { actor, data, project, run } = await plannedRun(input);
  await skipRankCheckRunCommand({
    actorId: actor.id,
    projectId: project.id,
    publicId: data.runId,
    runId: run.id,
  });
  revalidatePath(runsRoute, "page");
}
