import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { listCheckSchedules } from "@/lib/queries/rank-check-runs";
import { createSchedule } from "@/lib/rank-check/schedules/service";
import { createCheckScheduleSchema } from "@/lib/schemas/check-schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withAppRoute(async (request, actor) => {
  const projectId = new URL(request.url).searchParams.get("project") ?? "";
  const project = await requireProjectScope(
    actor,
    "read",
    projectId,
    { type: "check_schedule" },
    { allowReadOnly: true },
  );
  return dataResponse(await listCheckSchedules(project.id));
});

export const POST = withAppRoute(async (request, actor) => {
  const data = createCheckScheduleSchema.parse(await request.json());
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  return dataResponse(await createSchedule(actor.id, project.id, data));
});
