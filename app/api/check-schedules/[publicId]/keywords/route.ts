import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import {
  assignKeywordsToSchedule,
  removeKeywordsFromSchedule,
} from "@/lib/rank-check/schedules/service-membership";
import { checkScheduleMembershipSchema } from "@/lib/schemas/check-schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

async function input(request: Request, context: Context) {
  const body = (await request.json()) as Record<string, unknown>;
  return checkScheduleMembershipSchema.parse({
    ...body,
    scheduleId: (await context.params).publicId,
  });
}

export const POST = withAppRoute<Context>(async (request, actor, context) => {
  const data = await input(request, context);
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  return dataResponse(await assignKeywordsToSchedule(actor.id, project.id, data));
});

export const DELETE = withAppRoute<Context>(async (request, actor, context) => {
  const data = await input(request, context);
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  return dataResponse(await removeKeywordsFromSchedule(actor.id, project.id, data));
});
