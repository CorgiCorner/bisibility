import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { archiveSchedule } from "@/lib/rank-check/schedules/archive";
import { archiveCheckScheduleSchema } from "@/lib/schemas/check-schedule-lifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ publicId: string }> };
export const POST = withAppRoute<Context>(async (request, actor, context) => {
  const body = await request.json();
  const data = archiveCheckScheduleSchema.parse({
    ...body,
    scheduleId: (await context.params).publicId,
  });
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "check_schedule",
  });
  return dataResponse(await archiveSchedule(actor.id, project.id, data));
});
