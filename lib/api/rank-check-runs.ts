import "server-only";
import { readRunEvidence } from "@/lib/provider-evidence/projection/read-runs";
import {
  getRankCheckRun as readRun,
  listRankCheckRuns as readRuns,
} from "@/lib/queries/rank-check-runs";
import type { ApiContext } from "./context";
import { requireApiActor } from "./context";
import { requireApiPublicId } from "./public-id";
import { publicRankCheckRun } from "./rank-run-resource";
import { listResponse, resourceResponse } from "./responses";
import { scopedProject } from "./surface";

export async function listProjectRankCheckRuns(ctx: ApiContext, projectId: string) {
  const denied = scopedProject(ctx, projectId);
  if (denied) return denied;
  requireApiActor(ctx);
  const page = await readRuns(ctx.auth.project.id, ctx.url, { includeUnlaunched: true });
  const evidence = await readRunEvidence(
    ctx.auth.project.id,
    page.data.map((run) => run.id),
  );
  return listResponse(
    page.data.map((run) => ({
      ...publicRankCheckRun(run, projectId),
      evidence_projections: evidence.get(run.id) ?? null,
    })),
    page.nextCursor,
    { headers: ctx.headers },
  );
}
export async function getProjectRankCheckRun(ctx: ApiContext, projectId: string, runId: string) {
  const denied = scopedProject(ctx, projectId);
  if (denied) return denied;
  requireApiActor(ctx);
  const run = await readRun(ctx.auth.project.id, requireApiPublicId(runId, "rcr"));
  const evidence = await readRunEvidence(ctx.auth.project.id, [run.id]);
  return resourceResponse(
    { ...publicRankCheckRun(run, projectId), evidence_projections: evidence.get(run.id) ?? null },
    { headers: ctx.headers },
  );
}
