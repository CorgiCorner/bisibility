import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { getRankCheckRun } from "@/lib/queries/rank-check-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

export const GET = withAppRoute<Context>(async (request, actor, context) => {
  const projectId = new URL(request.url).searchParams.get("project") ?? "";
  const project = await requireProjectScope(
    actor,
    "read",
    projectId,
    { type: "keyword" },
    { allowReadOnly: true },
  );
  return dataResponse(await getRankCheckRun(project.id, (await context.params).publicId));
});
