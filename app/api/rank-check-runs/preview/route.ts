import { requireProjectScope } from "@/lib/actions/_shared";
import { previewRankCheckRunActionSchema } from "@/lib/actions/rank-check-run-preview-result";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { previewRankCheckRun } from "@/lib/rank-check/runs/preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withAppRoute(async (request, actor) => {
  const data = previewRankCheckRunActionSchema.parse(await request.json());
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  return dataResponse(
    await previewRankCheckRun({
      depth: data.depth,
      project,
      providerId: data.providerId,
      spec: data.spec,
    }),
  );
});
