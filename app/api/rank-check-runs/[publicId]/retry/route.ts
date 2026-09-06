import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { getRankCheckRun, getRetryParentRun } from "@/lib/queries/rank-check-runs";
import { launchRetryRun } from "@/lib/rank-check/runs/launch";
import { isLaunchRankCheckRunNothingToRun } from "@/lib/rank-check/runs/launch-types";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z
  .object({
    projectId: z.string(),
    relation: z.enum(["retry_failed", "retry_deferred"]),
  })
  .strict();
type Context = { params: Promise<{ publicId: string }> };

export const POST = withAppRoute<Context>(async (request, actor, context) => {
  const data = schema.parse(await request.json());
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const parentRun = await getRetryParentRun(project.id, (await context.params).publicId);
  const launched = await launchRetryRun({ actorId: actor.id, parentRun, relation: data.relation });
  if (isLaunchRankCheckRunNothingToRun(launched)) return dataResponse(launched);
  return dataResponse(await getRankCheckRun(project.id, launched.publicId));
});
