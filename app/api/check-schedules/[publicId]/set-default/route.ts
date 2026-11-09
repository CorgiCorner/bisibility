import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { setDefaultSchedule } from "@/lib/rank-check/schedules/service";
import { setDefaultCheckScheduleSchema } from "@/lib/schemas/check-schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

export const POST = withAppRoute<Context>(
  async (request, actor, context, onCommitted) => {
    const body = (await request.json()) as Record<string, unknown>;
    const data = setDefaultCheckScheduleSchema.parse({
      ...body,
      scheduleId: (await context.params).publicId,
    });
    const project = await requireProjectScope(actor, "manage", data.projectId, {
      type: "check_schedule",
    });
    const result = await setDefaultSchedule(actor.id, project.id, data.scheduleId);
    onCommitted();
    return dataResponse(result);
  },
  { mutation: true, explicitCommit: true },
);
