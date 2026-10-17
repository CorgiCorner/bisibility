import { requireProjectScope } from "@/lib/actions/_shared";
import { emitFirstCheckRunCompletion } from "@/lib/actions/rank-check-preview-analytics";
import { withAppRoute } from "@/lib/api/app-route";
import { listResponse } from "@/lib/api/responses";
import { listRankCheckRunItems } from "@/lib/queries/rank-check-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

export const GET = withAppRoute<Context>(async (request, actor, context) => {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project") ?? "";
  const project = await requireProjectScope(
    actor,
    "read",
    projectId,
    { type: "keyword" },
    { allowReadOnly: true },
  );
  const publicId = (await context.params).publicId;
  const page = await listRankCheckRunItems(project.id, publicId, url);
  if (page.data.some((item) => item.status === "completed")) {
    await emitFirstCheckRunCompletion({
      actorId: actor.id,
      projectId: project.id,
      runPublicIds: [publicId],
    });
  }
  return listResponse(page.data, page.nextCursor);
});
