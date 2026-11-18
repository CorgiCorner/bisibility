import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { ScheduleMutationError, scheduleNotFound } from "@/lib/schedules/errors";
import { scheduleMessage } from "@/lib/schedules/messages";
import type { ScheduleChange } from "@/lib/schedules/preview";
import { aiScheduleChange, rankMembershipChange } from "@/lib/schedules/web-change";
import { createCheckScheduleSchema, updateCheckScheduleSchema } from "@/lib/schemas/check-schedule";
import type { z } from "zod";
import { apiAiScheduleInput } from "./api-ai-schedule-input";
import type { ApiContext } from "./context";
import { internalScheduleId, parseInternalDataSyncId } from "./schedule-public-id";
import {
  isUnsupportedScheduleCreate,
  scheduleCreateBody,
  scheduleUpdateBody,
} from "./schedule-write-input";
import { requireSchedulePublicId } from "./schedules-input";

export function publicScheduleCreateChange(ctx: ApiContext, raw: unknown) {
  if (isUnsupportedScheduleCreate(raw))
    throw new ScheduleMutationError(
      "schedule_create_unsupported",
      scheduleMessage("createUnsupported"),
    );
  const body = scheduleCreateBody.parse(raw);
  const { review } = body;
  const change: ScheduleChange =
    body.kind === "ai"
      ? aiScheduleChange("POST", apiAiScheduleInput(ctx, body, false))
      : {
          op: "create",
          body: {
            kind: "rank",
            input: createCheckScheduleSchema.parse({
              ...rankFields(body),
              projectId: ctx.auth.project.publicId,
            }),
          },
        };
  return { change, review };
}

export function publicScheduleUpdateChange(ctx: ApiContext, publicId: string, raw: unknown) {
  const projectId = ctx.auth.project.publicId;
  const id = internalScheduleId(projectId, requireSchedulePublicId(publicId));
  if (!id) throw scheduleNotFound();
  const body = scheduleUpdateBody.parse(raw);
  const { review } = body;
  const change = updateChange(ctx, projectId, id, body);
  return { change, review };
}

function updateChange(
  ctx: ApiContext,
  projectId: string,
  id: string,
  body: z.infer<typeof scheduleUpdateBody>,
): ScheduleChange {
  const sync = parseInternalDataSyncId(id);
  if (!("kind" in body)) {
    const command = sync
      ? {
          kind: "data_sync" as const,
          publicWrite: true as const,
          auditActorId: ctx.actorId ?? null,
          projectPublicId: projectId,
          syncKind: sync.kind,
        }
      : isPublicIdOfType(id, "ais")
        ? { kind: "ai" as const }
        : isPublicIdOfType(id, "lmn")
          ? { kind: "local_monitor" as const, projectPublicId: projectId }
          : { kind: "rank" as const, projectPublicId: projectId };
    return { op: "state", id, state: body.state, command };
  }
  if (sync)
    throw new ScheduleMutationError(
      "data_sync_state_only",
      scheduleMessage("dataSyncUnsupported", "en", { syncKind: sync.kind }),
    );
  if (!isPublicIdOfType(id, body.kind === "rank" ? "sch" : "ais")) throw scheduleNotFound();
  if (body.kind === "rank" && body.target)
    return rankMembershipChange(projectId, id, body.target.keyword_ids);
  const { state, ...input } = body;
  const enabled = state === undefined ? undefined : state === "active";
  if (body.kind === "ai") {
    return aiScheduleChange(
      "PATCH",
      apiAiScheduleInput(ctx, { ...input, ...(enabled === undefined ? {} : { enabled }) }, true),
      id,
    );
  }
  return {
    op: "update",
    id,
    body: {
      kind: "rank",
      input: updateCheckScheduleSchema.parse({
        ...rankFields(body),
        enabled,
        projectId,
        scheduleId: id,
      }),
    },
  };
}

function rankFields(body: {
  name?: string;
  cadence?: {
    frequency?: string;
    cron_expression?: string | null;
    jitter_minutes?: number;
    time_of_day?: string | null;
    timezone?: string | null;
  };
  settings?: { provider_policy?: string | null; serp_depth?: number | null };
}) {
  return {
    name: body.name,
    frequency: body.cadence?.frequency,
    cronExpression: body.cadence?.cron_expression,
    jitterMinutes: body.cadence?.jitter_minutes,
    timeOfDay: body.cadence?.time_of_day,
    timezone: body.cadence?.timezone,
    providerPolicy: body.settings?.provider_policy,
    serpDepth: body.settings?.serp_depth,
  };
}
