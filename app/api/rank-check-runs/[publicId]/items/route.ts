import { requireProjectScope } from "@/lib/actions/_shared";
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
  const page = await listRankCheckRunItems(project.id, (await context.params).publicId, url);
  return listResponse(page.data, page.nextCursor);
});
