"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { withCapacityFailure } from "@/lib/capacity/action";
import {
  createSchedule,
  deleteSchedule,
  setDefaultSchedule,
  updateSchedule,
} from "@/lib/rank-check/schedules/service";
import {
  assignKeywordsToSchedule,
  removeKeywordsFromSchedule,
} from "@/lib/rank-check/schedules/service-membership";
import {
  checkScheduleMembershipSchema,
  createCheckScheduleSchema,
  deleteCheckScheduleSchema,
  setDefaultCheckScheduleSchema,
  updateCheckScheduleSchema,
} from "@/lib/schemas/check-schedule";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

export async function createCheckSchedule(input: unknown) {
  return withCapacityFailure(async () => {
    const data = parseActionInput(createCheckScheduleSchema, input);
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "update", data.projectId, {
      type: "check_schedule",
    });
    const actionResult = await createSchedule(actor.id, project.id, data);
    recordAppAction(actor);
    return actionResult;
  });
}

export async function updateCheckSchedule(input: unknown) {
  return withCapacityFailure(async () => {
    const data = parseActionInput(updateCheckScheduleSchema, input);
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "update", data.projectId, {
      type: "check_schedule",
    });
    const actionResult = await updateSchedule(actor.id, project.id, data);
    recordAppAction(actor);
    return actionResult;
  });
}

export async function setDefaultCheckSchedule(input: unknown) {
  const data = parseActionInput(setDefaultCheckScheduleSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "check_schedule",
  });
  const actionResult = await setDefaultSchedule(actor.id, project.id, data.scheduleId);
  recordAppAction(actor);
  return actionResult;
}

export async function deleteCheckSchedule(input: unknown) {
  const data = parseActionInput(deleteCheckScheduleSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "check_schedule",
  });
  const actionResult = await deleteSchedule(actor.id, project.id, data.scheduleId);
  recordAppAction(actor);
  return actionResult;
}

export async function assignKeywordsToCheckSchedule(input: unknown) {
  return withCapacityFailure(async () => {
    const data = parseActionInput(checkScheduleMembershipSchema, input);
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "update", data.projectId, {
      type: "check_schedule",
    });
    const actionResult = await assignKeywordsToSchedule(actor.id, project.id, data);
    if (actionResult.updated > 0) recordAppAction(actor);
    return actionResult;
  });
}

export async function removeKeywordsFromCheckSchedule(input: unknown) {
  const data = parseActionInput(checkScheduleMembershipSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  const actionResult = await removeKeywordsFromSchedule(actor.id, project.id, data);
  if (actionResult.updated > 0) recordAppAction(actor);
  return actionResult;
}
