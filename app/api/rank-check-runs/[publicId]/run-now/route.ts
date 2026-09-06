import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { getRankCheckRun, getRankCheckRunCommand } from "@/lib/queries/rank-check-runs";
import { runRankCheckRunNowCommand } from "@/lib/rank-check/runs/run-now";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ projectId: z.string() }).strict();
type Context = { params: Promise<{ publicId: string }> };

export const POST = withAppRoute<Context>(async (request, actor, context) => {
  const data = schema.parse(await request.json());
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const publicId = (await context.params).publicId;
  const run = await getRankCheckRunCommand(project.id, publicId);
  await runRankCheckRunNowCommand({
    actorId: actor.id,
    orchestrationWorkflowId: run.orchestrationWorkflowId,
    projectId: project.id,
    publicId,
    runId: run.id,
  });
  return dataResponse(await getRankCheckRun(project.id, publicId));
});
