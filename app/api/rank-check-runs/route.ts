import { requireProjectScope } from "@/lib/actions/_shared";
import { launchRankCheckRunActionSchema } from "@/lib/actions/rank-check-run-launch-result";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse, listResponse } from "@/lib/api/responses";
import { getRankCheckRun, listRankCheckRuns } from "@/lib/queries/rank-check-runs";
import { launchRankCheckRun } from "@/lib/rank-check/runs/launch";
import { isLaunchRankCheckRunNothingToRun } from "@/lib/rank-check/runs/launch-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withAppRoute(async (request, actor) => {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project") ?? "";
  const project = await requireProjectScope(
    actor,
    "read",
    projectId,
    { type: "keyword" },
    { allowReadOnly: true },
  );
  const page = await listRankCheckRuns(project.id, url);
  return listResponse(page.data, page.nextCursor);
});

export const POST = withAppRoute(async (request, actor) => {
  const body = (await request.json()) as Record<string, unknown>;
  const data = launchRankCheckRunActionSchema.parse({
    ...body,
    idempotencyKey: body.idempotencyKey ?? request.headers.get("Idempotency-Key") ?? undefined,
  });
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const launched = await launchRankCheckRun({
    actorId: actor.id,
    depth: data.depth,
    idempotencyKey: data.idempotencyKey,
    previewToken: data.previewToken,
    project,
    providerId: data.providerId,
    spec: data.spec,
    trigger: "api",
  });
  if (isLaunchRankCheckRunNothingToRun(launched)) return dataResponse(launched);
  return dataResponse(await getRankCheckRun(project.id, launched.publicId));
});
