import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { setScheduleState } from "@/lib/schedules/mutations";
import { WEB_UNGATED_REVIEW } from "@/lib/schedules/review-commit";
import { restoreCheckScheduleSchema } from "@/lib/schemas/check-schedule-lifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ publicId: string }> };
export const POST = withAppRoute<Context>(
  async (request, actor, context, onCommitted) => {
    const body = await request.json();
    const data = restoreCheckScheduleSchema.parse({
      ...body,
      scheduleId: (await context.params).publicId,
    });
    const project = await requireProjectScope(actor, "manage", data.projectId, {
      type: "check_schedule",
    });
    const result = await setScheduleState(
      project.id,
      actor,
      data.scheduleId,
      "paused",
      {
        kind: "rank",
        projectPublicId: data.projectId,
        restore: true,
      },
      WEB_UNGATED_REVIEW,
    );
    if ("changed" in result && result.changed) onCommitted();
    return dataResponse(result);
  },
  { mutation: true, explicitCommit: true },
);
