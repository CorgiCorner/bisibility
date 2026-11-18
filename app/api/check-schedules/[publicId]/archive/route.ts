import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { setScheduleState } from "@/lib/schedules/mutations";
import { withWebScheduleReview } from "@/lib/schedules/web-review";
import { archiveCheckScheduleSchema } from "@/lib/schemas/check-schedule-lifecycle";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ publicId: string }> };
export const POST = withAppRoute<Context>(
  async (request, actor, context, onCommitted) => {
    const { body, review } = splitScheduleReview(await request.json());
    const data = archiveCheckScheduleSchema.parse({
      ...body,
      scheduleId: (await context.params).publicId,
    });
    const project = await requireProjectScope(actor, "manage", data.projectId, {
      type: "check_schedule",
    });
    const change = {
      op: "state" as const,
      id: data.scheduleId,
      state: "archived" as const,
      command: { archive: data, kind: "rank" as const },
    };
    const result = await withWebScheduleReview(project.id, actor, change, () =>
      setScheduleState(
        project.id,
        actor,
        data.scheduleId,
        "archived",
        {
          archive: data,
          kind: "rank",
        },
        { gate: true, review },
      ),
    );
    if ("changed" in result && result.changed) onCommitted();
    return dataResponse(result);
  },
  { mutation: true, explicitCommit: true },
);
