"use server";

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
  const data = parseActionInput(createCheckScheduleSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  return createSchedule(actor.id, project.id, data);
}

export async function updateCheckSchedule(input: unknown) {
  const data = parseActionInput(updateCheckScheduleSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  return updateSchedule(actor.id, project.id, data);
}

export async function setDefaultCheckSchedule(input: unknown) {
  const data = parseActionInput(setDefaultCheckScheduleSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "check_schedule",
  });
  return setDefaultSchedule(actor.id, project.id, data.scheduleId);
}

export async function deleteCheckSchedule(input: unknown) {
  const data = parseActionInput(deleteCheckScheduleSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "check_schedule",
  });
  return deleteSchedule(actor.id, project.id, data.scheduleId);
}

export async function assignKeywordsToCheckSchedule(input: unknown) {
  const data = parseActionInput(checkScheduleMembershipSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  return assignKeywordsToSchedule(actor.id, project.id, data);
}

export async function removeKeywordsFromCheckSchedule(input: unknown) {
  const data = parseActionInput(checkScheduleMembershipSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "check_schedule",
  });
  return removeKeywordsFromSchedule(actor.id, project.id, data);
}
