import "server-only";
import { getSchedule, listSchedules } from "@/lib/schedules/service";
import type { ApiContext } from "./context";
import { notFound, projectMatches } from "./context";
import { paginateItems } from "./pagination";
import { listResponse, resourceResponse } from "./responses";
import { internalScheduleId } from "./schedule-public-id";
import { scheduleResource } from "./schedule-resource";
import { requireSchedulePublicId, scheduleListQuerySchema } from "./schedules-input";

export async function listProjectSchedules(ctx: ApiContext) {
  if (!projectMatches(ctx.auth, ctx.path[1])) return notFound(ctx, "Project not found.");
  const query = scheduleListQuerySchema.parse(Object.fromEntries(ctx.url.searchParams));
  const schedules = (
    await listSchedules(ctx.auth.project.id, {
      status: query.state === "archived" ? "archived" : "current",
    })
  )
    .map(scheduleResource)
    .filter(
      (schedule) =>
        (!query.kind || schedule.kind === query.kind) &&
        (!query.state || schedule.state === query.state),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const { page, nextCursor } = paginateItems(schedules, { ...query, limit: query.limit ?? 50 });
  return listResponse(page, nextCursor, { headers: ctx.headers });
}

export async function getProjectSchedule(ctx: ApiContext) {
  if (!projectMatches(ctx.auth, ctx.path[1])) return notFound(ctx, "Project not found.");
  const publicId = requireSchedulePublicId(ctx.path[3] ?? "");
  const id = internalScheduleId(ctx.auth.project.publicId, publicId);
  if (!id) return notFound(ctx, "Schedule not found.");
  const schedule = await getSchedule(ctx.auth.project.id, id);
  return schedule
    ? resourceResponse(scheduleResource(schedule), { headers: ctx.headers })
    : notFound(ctx, "Schedule not found.");
}
