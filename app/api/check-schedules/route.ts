import { requireProjectScope } from "@/lib/actions/_shared";
import { withAppRoute } from "@/lib/api/app-route";
import { dataResponse } from "@/lib/api/responses";
import { listCheckSchedules } from "@/lib/queries/rank-check-runs";
import { createSchedule } from "@/lib/schedules/mutations";
import { withWebScheduleReview } from "@/lib/schedules/web-review";
import { createCheckScheduleSchema } from "@/lib/schemas/check-schedule";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";

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

export const POST = withAppRoute(
  async (request, actor, _context, onCommitted) => {
    const { body, review } = splitScheduleReview(await request.json());
    const data = createCheckScheduleSchema.parse(body);
    const project = await requireProjectScope(actor, "update", data.projectId, {
      type: "check_schedule",
    });
    const result = await withWebScheduleReview(
      project.id,
      actor,
      { op: "create", body: { input: data, kind: "rank" } },
      () =>
        createSchedule(project.id, actor, { input: data, kind: "rank" }, { gate: true, review }),
    );
    onCommitted();
    return dataResponse(result);
  },
  { mutation: true, explicitCommit: true },
);
