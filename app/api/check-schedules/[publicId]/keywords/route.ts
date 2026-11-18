import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { updateSchedule } from "@/lib/schedules/mutations";
import { withWebScheduleReview } from "@/lib/schedules/web-review";
import { checkScheduleMembershipSchema } from "@/lib/schemas/check-schedule";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

async function input(request: Request, context: Context) {
  const { body, review } = splitScheduleReview(await request.json());
  return {
    review,
    data: checkScheduleMembershipSchema.parse({
      ...body,
      scheduleId: (await context.params).publicId,
    }),
  };
}

export const POST = withAppRoute<Context>(
  async (request, actor, context, onCommitted) => {
    const { data, review } = await input(request, context);
    const project = await requireProjectScope(actor, "update", data.projectId, {
      type: "check_schedule",
    });
    const result = await withWebScheduleReview(
      project.id,
      actor,
      {
        op: "update",
        id: data.scheduleId,
        body: { kind: "rank-membership", membership: data, operation: "assign" },
      },
      () =>
        updateSchedule(
          project.id,
          actor,
          data.scheduleId,
          { kind: "rank-membership", membership: data, operation: "assign" },
          { gate: true, review },
        ),
    );
    if ("updated" in result && result.updated > 0) onCommitted();
    return dataResponse(result);
  },
  { mutation: true, explicitCommit: true },
);

export const DELETE = withAppRoute<Context>(
  async (request, actor, context, onCommitted) => {
    const { data, review } = await input(request, context);
    const project = await requireProjectScope(actor, "update", data.projectId, {
      type: "check_schedule",
    });
    const result = await withWebScheduleReview(
      project.id,
      actor,
      {
        op: "update",
        id: data.scheduleId,
        body: { kind: "rank-membership", membership: data, operation: "remove" },
      },
      () =>
        updateSchedule(
          project.id,
          actor,
          data.scheduleId,
          { kind: "rank-membership", membership: data, operation: "remove" },
          { gate: true, review },
        ),
    );
    if ("updated" in result && result.updated > 0) onCommitted();
    return dataResponse(result);
  },
  { mutation: true, explicitCommit: true },
);
