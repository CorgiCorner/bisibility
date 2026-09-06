import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { getCheckSchedule } from "@/lib/queries/rank-check-runs";
import { deleteSchedule, updateSchedule } from "@/lib/rank-check/schedules/service";
import { deleteCheckScheduleSchema, updateCheckScheduleSchema } from "@/lib/schemas/check-schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

export const GET = withAppRoute<Context>(async (request, actor, context) => {
  const projectId = new URL(request.url).searchParams.get("project") ?? "";
  const project = await requireProjectScope(
    actor,
    "read",
    projectId,
    { type: "check_schedule" },
    { allowReadOnly: true },
  );
  return dataResponse(await getCheckSchedule(project.id, (await context.params).publicId));
});

export const PATCH = withAppRoute<Context>(async (request, actor, context) => {
  const body = (await request.json()) as Record<string, unknown>;
  const data = updateCheckScheduleSchema.parse({
    ...body,
    scheduleId: (await context.params).publicId,
  });
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  return dataResponse(await updateSchedule(actor.id, project.id, data));
});

export const DELETE = withAppRoute<Context>(async (request, actor, context) => {
  const body = (await request.json()) as Record<string, unknown>;
  const data = deleteCheckScheduleSchema.parse({
    ...body,
    scheduleId: (await context.params).publicId,
  });
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "check_schedule",
  });
  return dataResponse(await deleteSchedule(actor.id, project.id, data.scheduleId));
});
