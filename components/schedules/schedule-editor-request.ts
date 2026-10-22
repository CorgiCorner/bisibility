import { calendarCronExpression } from "@/lib/rank-check/schedule-calendar";
import type { ScheduleEditorValues } from "./ScheduleEditorModel";

type ApiResponse<T> = { data: T };

class ScheduleSaveError extends Error {
  constructor(readonly status: number) {
    super("Schedule save failed.");
  }
}

export function saveErrorKey(error: unknown) {
  if (!(error instanceof ScheduleSaveError)) return "saveFailed";
  switch (error.status) {
    case 401:
      return "saveSessionExpired";
    case 403:
      return "saveForbidden";
    case 404:
      return "saveNotFound";
    case 409:
      return "saveConflict";
    case 423:
      return "saveReadOnly";
    case 400:
      return "saveInvalid";
    default:
      return "saveFailed";
  }
}

export async function request<T>(url: string, method: "PATCH" | "POST", body: object) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method,
  });
  if (!response.ok) throw new ScheduleSaveError(response.status);
  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

export function payload(values: ScheduleEditorValues, projectId: string) {
  return {
    cronExpression:
      values.frequency === "custom_cron" ? values.cronExpression : calendarCronExpression(values),
    frequency: values.frequency,
    jitterMinutes: Number(values.jitterMinutes),
    name: values.name,
    projectId,
    providerPolicy: values.providerPolicy === "project" ? null : values.providerPolicy,
    serpDepth: values.serpDepth === "project" ? null : Number(values.serpDepth),
    timeOfDay: values.frequency === "custom_cron" ? null : values.timeOfDay || null,
    timezone: values.timezone || null,
  };
}
