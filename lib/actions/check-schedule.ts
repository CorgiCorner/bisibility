"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { withCapacityFailure } from "@/lib/capacity/action";
import { withScheduleReviewActionResult } from "@/lib/schedules/action-result";
import {
  createSchedule,
  deleteSchedule,
  isRankEnabledChange,
  setScheduleState,
  updateSchedule,
} from "@/lib/schedules/mutations";
import { WEB_UNGATED_REVIEW } from "@/lib/schedules/review-commit";
import { withWebScheduleReview } from "@/lib/schedules/web-review";
import {
  checkScheduleMembershipSchema,
  createCheckScheduleSchema,
  deleteCheckScheduleSchema,
  updateCheckScheduleSchema,
} from "@/lib/schemas/check-schedule";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

export async function createCheckSchedule(input: unknown) {
  return withCapacityFailure(() =>
    withScheduleReviewActionResult(async () => {
      const { body, review } = splitScheduleReview(input);
      const data = parseActionInput(createCheckScheduleSchema, body);
      const actor = await getActionActor();
      const project = await requireProjectScope(actor, "update", data.projectId, {
        type: "check_schedule",
      });
      const change = { op: "create" as const, body: { input: data, kind: "rank" as const } };
      const actionResult = await withWebScheduleReview(project.id, actor, change, () =>
        createSchedule(project.id, actor, { input: data, kind: "rank" }, { gate: true, review }),
      );
      recordAppAction(actor);
      return actionResult;
    }),
  );
}

export async function updateCheckSchedule(input: unknown) {
  return withCapacityFailure(() =>
    withScheduleReviewActionResult(async () => {
      const { body, review } = splitScheduleReview(input);
      const data = parseActionInput(updateCheckScheduleSchema, body);
      const actor = await getActionActor();
      const project = await requireProjectScope(actor, "update", data.projectId, {
        type: "check_schedule",
      });
      const enabledChange = isRankEnabledChange(data);
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
      const actionResult = await withWebScheduleReview(project.id, actor, change, async () =>
        enabledChange
          ? setScheduleState(
              project.id,
              actor,
              data.scheduleId,
              data.enabled ? "active" : "paused",
              { kind: "rank", projectPublicId: data.projectId },
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
      recordAppAction(actor);
      return actionResult;
    }),
  );
}

export async function deleteCheckSchedule(input: unknown) {
  const data = parseActionInput(deleteCheckScheduleSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "check_schedule",
  });
  const actionResult = await deleteSchedule(project.id, actor, data.scheduleId, WEB_UNGATED_REVIEW);
  recordAppAction(actor);
  return actionResult;
}

export async function assignKeywordsToCheckSchedule(input: unknown) {
  return withCapacityFailure(() =>
    withScheduleReviewActionResult(async () => {
      const { body, review } = splitScheduleReview(input);
      const data = parseActionInput(checkScheduleMembershipSchema, body);
      const actor = await getActionActor();
      const project = await requireProjectScope(actor, "update", data.projectId, {
        type: "check_schedule",
      });
      const change = {
        op: "update" as const,
        id: data.scheduleId,
        body: { kind: "rank-membership" as const, membership: data, operation: "assign" as const },
      };
      const actionResult = await withWebScheduleReview(project.id, actor, change, () =>
        updateSchedule(
          project.id,
          actor,
          data.scheduleId,
          { kind: "rank-membership", membership: data, operation: "assign" },
          { gate: true, review },
        ),
      );
      if ("updated" in actionResult && actionResult.updated > 0) recordAppAction(actor);
      return actionResult;
    }),
  );
}

export async function removeKeywordsFromCheckSchedule(input: unknown) {
  return withCapacityFailure(() =>
    withScheduleReviewActionResult(async () => {
      const { body, review } = splitScheduleReview(input);
      const data = parseActionInput(checkScheduleMembershipSchema, body);
      const actor = await getActionActor();
      const project = await requireProjectScope(actor, "update", data.projectId, {
        type: "check_schedule",
      });
      const change = {
        op: "update" as const,
        id: data.scheduleId,
        body: { kind: "rank-membership" as const, membership: data, operation: "remove" as const },
      };
      const actionResult = await withWebScheduleReview(project.id, actor, change, () =>
        updateSchedule(
          project.id,
          actor,
          data.scheduleId,
          { kind: "rank-membership", membership: data, operation: "remove" },
          { gate: true, review },
        ),
      );
      if ("updated" in actionResult && actionResult.updated > 0) recordAppAction(actor);
      return actionResult;
    }),
  );
}
