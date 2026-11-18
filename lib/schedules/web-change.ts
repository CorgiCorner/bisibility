import type { ScheduleInput } from "@/lib/ai-tracking/stores/signatures";
import { scheduleMessage } from "./messages";
import type { ScheduleChange } from "./preview";

export function aiScheduleChange(
  method: "POST" | "PATCH" | "DELETE",
  input: unknown,
  id?: string,
  locale = "en",
): ScheduleChange {
  if (method === "POST")
    return { op: "create", body: { kind: "ai", input: input as ScheduleInput } };
  if (!id) throw new Error(scheduleMessage("notFound", locale));
  if (method === "DELETE")
    return { op: "state", id, state: "archived", command: { kind: "ai", value: input } };
  if (
    input &&
    typeof input === "object" &&
    Object.keys(input).length === 1 &&
    "enabled" in input &&
    input.enabled === false
  )
    return { op: "state", id, state: "paused", command: { kind: "ai" } };
  return { op: "update", id, body: { kind: "ai", input: input as Partial<ScheduleInput> } };
}

export function rankScheduleChange(
  projectId: string,
  id: string | null,
  input: object,
): ScheduleChange {
  return id
    ? {
        op: "update",
        id,
        body: {
          kind: "rank",
          input: {
            ...input,
            projectId,
            scheduleId: id,
          } as import("@/lib/schemas/check-schedule").UpdateCheckScheduleInput,
        },
      }
    : {
        op: "create",
        body: {
          kind: "rank",
          input: {
            ...input,
            projectId,
          } as import("@/lib/schemas/check-schedule").CreateCheckScheduleInput,
        },
      };
}

export function rankMembershipChange(
  projectId: string,
  scheduleId: string,
  keywordIds: readonly string[],
  operation: "assign" | "remove" = "assign",
): ScheduleChange {
  return {
    op: "update",
    id: scheduleId,
    body: {
      kind: "rank-membership",
      operation,
      membership: {
        projectId,
        scheduleId,
        keywordIds: [...keywordIds],
      } as import("@/lib/schemas/check-schedule").CheckScheduleMembershipInput,
    },
  };
}
