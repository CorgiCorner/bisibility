import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { getCheckSchedule } from "@/lib/queries/rank-check-runs";
import {
  deleteSchedule,
  isRankEnabledChange,
  setScheduleState,
  updateSchedule,
} from "@/lib/schedules/mutations";
import { WEB_UNGATED_REVIEW } from "@/lib/schedules/review-commit";
import { withWebScheduleReview } from "@/lib/schedules/web-review";
import { deleteCheckScheduleSchema, updateCheckScheduleSchema } from "@/lib/schemas/check-schedule";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";

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

export const PATCH = withAppRoute<Context>(
  async (request, actor, context, onCommitted) => {
    const { body, review } = splitScheduleReview(await request.json());
    const data = updateCheckScheduleSchema.parse({
      ...body,
      scheduleId: (await context.params).publicId,
    });
    const project = await requireProjectScope(actor, "update", data.projectId, {
      type: "check_schedule",
    });
    const enabledChange = isRankEnabledChange(body);
    const change = enabledChange
      ? {
          op: "state" as const,
          id: data.scheduleId,
          state: data.enabled ? ("active" as const) : ("paused" as const),
          command: { kind: "rank" as const, projectPublicId: data.projectId },
        }
      : {
          op: "update" as const,
          id: data.scheduleId,
          body: { input: data, kind: "rank" as const },
        };
    const result = await withWebScheduleReview(project.id, actor, change, async () =>
      enabledChange
        ? setScheduleState(
            project.id,
            actor,
            data.scheduleId,
            data.enabled ? "active" : "paused",
            {
              kind: "rank",
              projectPublicId: data.projectId,
            },
            { gate: true, review },
          )
        : updateSchedule(
            project.id,
            actor,
            data.scheduleId,
            { input: data, kind: "rank" },
            { gate: true, review },
          ),
    );
    onCommitted();
    return dataResponse(result);
  },
  { mutation: true, explicitCommit: true },
);

export const DELETE = withAppRoute<Context>(
  async (request, actor, context, onCommitted) => {
    const body = (await request.json()) as Record<string, unknown>;
    const data = deleteCheckScheduleSchema.parse({
      ...body,
      scheduleId: (await context.params).publicId,
    });
    const project = await requireProjectScope(actor, "manage", data.projectId, {
      type: "check_schedule",
    });
    const result = await deleteSchedule(project.id, actor, data.scheduleId, WEB_UNGATED_REVIEW);
    onCommitted();
    return dataResponse(result);
  },
  { mutation: true, explicitCommit: true },
);
