import "server-only";
import type { ScheduleInput } from "@/lib/ai-tracking/stores/signatures";
import { mutateTrackingCatalog } from "@/lib/api/ai-tracking-service";
import type { Actor } from "@/lib/auth/authorize";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  createSchedule as createRankSchedule,
  deleteSchedule as deleteRankSchedule,
  updateSchedule as updateRankSchedule,
} from "@/lib/rank-check/schedules/service";
import {
  assignKeywordsToSchedule,
  removeKeywordsFromSchedule,
} from "@/lib/rank-check/schedules/service-membership";
import type {
  CheckScheduleMembershipInput,
  CreateCheckScheduleInput,
  UpdateCheckScheduleInput,
} from "@/lib/schemas/check-schedule";
import { readScheduleState, type ScheduleStateCommand } from "./current-state";
import { DataSyncStateError, ScheduleMutationError } from "./errors";
import { scheduleMessage } from "./messages";
import { assertScheduleTransition, setScheduleStateNow } from "./mutation-runs";
import { commitReviewedScheduleWrite, type ScheduleWriteOptions } from "./review-commit";
import type { DataSyncKind, ScheduleState } from "./types";

type CatalogMutation = Awaited<ReturnType<typeof mutateTrackingCatalog>>;
const RANK_CONTENT_FIELDS = [
  "cronExpression",
  "frequency",
  "jitterMinutes",
  "name",
  "providerPolicy",
  "serpDepth",
  "timeOfDay",
  "timezone",
] as const;

export type ScheduleCreateInput =
  | { kind: "rank"; input: CreateCheckScheduleInput }
  | { kind: "ai"; input: ScheduleInput };

export type ScheduleUpdateInput =
  | { kind: "rank"; input: UpdateCheckScheduleInput }
  | {
      kind: "rank-membership";
      membership: CheckScheduleMembershipInput;
      operation: "assign" | "remove";
    }
  | { kind: "ai"; input: Partial<ScheduleInput> }
  | { kind: "data_sync"; syncKind: DataSyncKind };

export { assertScheduleTransition } from "./mutation-runs";
export type { ScheduleStateCommand };

export function isRankEnabledChange(body: object) {
  const record = body as Record<string, unknown>;
  return (
    typeof record.enabled === "boolean" &&
    RANK_CONTENT_FIELDS.every((key) => record[key] === undefined)
  );
}

export function isAiPause(input: unknown): input is { enabled: false } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  return Object.keys(record).length === 1 && record.enabled === false;
}

export async function createSchedule(
  projectId: string,
  actor: Actor,
  input: ScheduleCreateInput,
  options?: ScheduleWriteOptions,
) {
  return commitReviewedScheduleWrite({
    actor,
    change: { body: input, op: "create" },
    options,
    projectId,
    run: (_consent, tx) => createScheduleNow(projectId, actor, input, tx),
  });
}

function createScheduleNow(
  projectId: string,
  actor: Actor,
  input: ScheduleCreateInput,
  tx?: Prisma.TransactionClient,
) {
  if (input.kind === "rank") {
    return tx
      ? createRankSchedule(actor.id, projectId, input.input, tx)
      : createRankSchedule(actor.id, projectId, input.input);
  }
  if (input.kind === "ai") {
    return tx
      ? mutateTrackingCatalog(projectId, "schedules", "POST", input.input, undefined, tx)
      : mutateTrackingCatalog(projectId, "schedules", "POST", input.input);
  }
  throw new ScheduleMutationError(
    "schedule_create_unsupported",
    scheduleMessage("createUnsupported"),
  );
}

export async function updateSchedule(
  projectId: string,
  actor: Actor,
  id: string,
  patch: ScheduleUpdateInput,
  options?: ScheduleWriteOptions,
) {
  return commitReviewedScheduleWrite({
    actor,
    change: { body: patch, id, op: "update" },
    options,
    projectId,
    run: (consent, tx) => updateScheduleNow(projectId, actor, id, patch, tx, consent),
  });
}

function boundConsent(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value !== "object") return undefined;
  if (seen.has(value) || depth >= 4) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => boundConsent(item, depth + 1, seen));
  }
  const bounded: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    bounded[key.slice(0, 80)] = boundConsent(item, depth + 1, seen);
  }
  return bounded;
}

function consentText(consent: unknown) {
  if (!consent || typeof consent !== "object") return undefined;
  const text = JSON.stringify(boundConsent(consent, 0, new WeakSet()));
  return text.length > 500 ? text.slice(0, 500) : text;
}

async function updateScheduleNow(
  projectId: string,
  actor: Actor,
  id: string,
  patch: ScheduleUpdateInput,
  tx?: Prisma.TransactionClient,
  consent?: unknown,
) {
  const clientConsent = consentText(consent);
  if (patch.kind === "rank-membership") {
    if (patch.operation === "assign") {
      if (tx)
        return assignKeywordsToSchedule(actor.id, projectId, patch.membership, tx, clientConsent);
      if (clientConsent) {
        return assignKeywordsToSchedule(
          actor.id,
          projectId,
          patch.membership,
          undefined,
          clientConsent,
        );
      }
      return assignKeywordsToSchedule(actor.id, projectId, patch.membership);
    }
    return tx
      ? removeKeywordsFromSchedule(actor.id, projectId, patch.membership, tx)
      : removeKeywordsFromSchedule(actor.id, projectId, patch.membership);
  }
  if (patch.kind === "rank") {
    if (typeof patch.input.enabled === "boolean") {
      const stored = await readScheduleState(projectId, id, { kind: "rank" }, tx);
      assertScheduleTransition(stored.state, patch.input.enabled ? "active" : "paused");
    }
    if (tx) return updateRankSchedule(actor.id, projectId, patch.input, tx, clientConsent);
    if (clientConsent)
      return updateRankSchedule(actor.id, projectId, patch.input, undefined, clientConsent);
    return updateRankSchedule(actor.id, projectId, patch.input);
  }
  if (patch.kind === "data_sync") throw new DataSyncStateError(patch.syncKind);
  if (typeof patch.input.enabled === "boolean") {
    const stored = await readScheduleState(projectId, id, { kind: "ai" }, tx);
    assertScheduleTransition(stored.state, patch.input.enabled ? "active" : "paused");
  }
  return tx
    ? mutateTrackingCatalog(projectId, "schedules", "PATCH", patch.input, id, tx)
    : mutateTrackingCatalog(projectId, "schedules", "PATCH", patch.input, id);
}

export async function setScheduleState(
  projectId: string,
  actor: Actor,
  id: string,
  state: ScheduleState,
  command: ScheduleStateCommand,
  options?: ScheduleWriteOptions,
) {
  return commitReviewedScheduleWrite({
    actor,
    change: { command, id, op: "state", state },
    options,
    projectId,
    run: (_consent, tx) => setScheduleStateNow(projectId, actor, id, state, command, tx),
  });
}

export async function deleteSchedule(
  projectId: string,
  actor: Actor,
  id: string,
  options?: ScheduleWriteOptions,
) {
  return commitReviewedScheduleWrite({
    actor,
    change: { id, op: "delete" },
    options,
    projectId,
    run: () => deleteRankSchedule(actor.id, projectId, id),
  });
}

export async function mutateAiSchedule(
  projectId: string,
  actor: Actor,
  method: "POST" | "PATCH" | "DELETE",
  input: unknown,
  id?: string,
  options?: ScheduleWriteOptions,
): Promise<CatalogMutation> {
  if (method === "POST") {
    return createSchedule(
      projectId,
      actor,
      { input: input as ScheduleInput, kind: "ai" },
      options,
    ) as Promise<CatalogMutation>;
  }
  if (!id) throw new ScheduleMutationError("schedule_not_found", scheduleMessage("notFound"));
  if (method === "DELETE") {
    return setScheduleState(
      projectId,
      actor,
      id,
      "archived",
      { kind: "ai", value: input },
      options,
    ) as Promise<CatalogMutation>;
  }
  if (isAiPause(input)) {
    return setScheduleState(
      projectId,
      actor,
      id,
      "paused",
      { kind: "ai" },
      options,
    ) as Promise<CatalogMutation>;
  }
  return updateSchedule(
    projectId,
    actor,
    id,
    { input: input as Partial<ScheduleInput>, kind: "ai" },
    options,
  ) as Promise<CatalogMutation>;
}
