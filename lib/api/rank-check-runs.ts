import "server-only";
import { readRunEvidence } from "@/lib/provider-evidence/projection/read-runs";
import { rankRunDeferralReasons } from "@/lib/queries/rank-check-run-reasons";
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
  const runIds = page.data.map((run) => run.id);
  const [evidence, reasons] = await Promise.all([
    readRunEvidence(ctx.auth.project.id, runIds),
    rankRunDeferralReasons(ctx.auth.project.id, runIds),
  ]);
  return listResponse(
    page.data.map((run) => ({
      ...publicRankCheckRun(run, projectId),
      evidence_projections: evidence.get(run.id) ?? null,
      deferral_reasons: reasons.get(run.id) ?? [],
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
  const [evidence, reasons] = await Promise.all([
    readRunEvidence(ctx.auth.project.id, [run.id]),
    rankRunDeferralReasons(ctx.auth.project.id, [run.id]),
  ]);
  return resourceResponse(
    {
      ...publicRankCheckRun(run, projectId),
      evidence_projections: evidence.get(run.id) ?? null,
      deferral_reasons: reasons.get(run.id) ?? [],
    },
    { headers: ctx.headers },
  );
}
