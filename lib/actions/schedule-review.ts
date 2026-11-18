"use server";

import { withScheduleReviewActionResult } from "@/lib/schedules/action-result";
import { ScheduleMutationError } from "@/lib/schedules/errors";
import { previewScheduleChange, type ScheduleChange } from "@/lib/schedules/preview";
import {
  checkScheduleMembershipSchema,
  createCheckScheduleSchema,
  updateCheckScheduleSchema,
} from "@/lib/schemas/check-schedule";
import { keywordCreateReviewSchema } from "@/lib/schemas/keyword-create-review";
import { z } from "zod";
import { getActionActor, requireProjectScope } from "./_shared";
import { stampAppScheduleInput } from "./ai-tracking-input";

const keywordIds = z.array(z.string().min(1)).max(500);
const aiInput = z
  .object({
    configuration: z
      .object({
        configurations: z.array(z.unknown()).max(20).optional(),
        promptIds: z.array(z.string()).max(100),
      })
      .passthrough(),
  })
  .passthrough();
const createBody = z.discriminatedUnion("kind", [
  z.object({ input: aiInput, kind: z.literal("ai") }),
  z.object({ input: z.object({}).passthrough(), kind: z.literal("rank") }),
]);
const updateBody = z.discriminatedUnion("kind", [
  z.object({ input: aiInput.partial(), kind: z.literal("ai") }),
  z.object({ input: z.object({}).passthrough(), kind: z.literal("rank") }),
  z.object({
    kind: z.literal("rank-membership"),
    membership: z.object({ keywordIds }).passthrough(),
    operation: z.string().min(1),
  }),
  z.object({ kind: z.literal("data_sync") }).passthrough(),
]);

const previewInputSchema = z.object({
  change: z.discriminatedUnion("op", [
    z.object({
      op: z.literal("market-reactivate"),
      marketIds: z.array(z.string().regex(/^pmkt_[a-z][a-z0-9]{23}$/)).max(5),
      mode: z.enum(["resume", "restore", "add"]),
    }),
    keywordCreateReviewSchema,
    z.object({ body: createBody, op: z.literal("create") }),
    z.object({
      body: updateBody,
      id: z.string().min(1),
      op: z.literal("update"),
    }),
    z.object({
      command: z.object({ kind: z.string().min(1) }).passthrough(),
      id: z.string().min(1),
      op: z.literal("state"),
      state: z.enum(["active", "archived", "paused"]),
    }),
    z.object({
      keywordIds,
      op: z.literal("keywords"),
      scheduleId: z.string().min(1).nullable(),
    }),
    z.object({ id: z.string().min(1), op: z.literal("delete") }),
  ]),
  projectId: z.string().trim().min(1),
});

type ReviewPermission = {
  action: "create" | "manage" | "update" | "delete";
  type:
    | "keyword"
    | "check_schedule"
    | "local_measurement_run"
    | "project_market"
    | "project"
    | "provider_connection";
};

/** Matches the server action that performs the same mutation. */
function scheduleReviewPermission(change: ScheduleChange): ReviewPermission {
  if (change.op === "market-reactivate")
    return {
      action: change.mode === "restore" ? "delete" : change.mode === "add" ? "create" : "update",
      type: "project_market",
    };
  if (change.op === "keywords-create")
    return {
      action: "create",
      type: change.source?.kind === "market-create" ? "project_market" : "keyword",
    };
  if (change.op === "delete") return { action: "manage", type: "check_schedule" };
  if (
    (change.op === "update" && change.body.kind === "data_sync") ||
    (change.op === "state" && change.command.kind === "data_sync")
  ) {
    return { action: "manage", type: "provider_connection" };
  }
  if (change.op === "state" && change.command.kind === "local_monitor") {
    return { action: "update", type: "local_measurement_run" };
  }
  if (
    (change.op === "create" && change.body.kind === "ai") ||
    (change.op === "update" && change.body.kind === "ai") ||
    (change.op === "state" && change.command.kind === "ai")
  ) {
    return { action: "update", type: "project" };
  }
  return { action: "update", type: "check_schedule" };
}

export async function previewScheduleChangeAction(input: {
  change: ScheduleChange;
  projectId: string;
}) {
  return withScheduleReviewActionResult(async () => {
    const parsed = previewInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ScheduleMutationError(
        "schedule_review_invalid",
        "The schedule preview input is invalid.",
      );
    }
    const actor = await getActionActor();
    let change = parsed.data.change as ScheduleChange;
    if (change.op === "create")
      change = {
        ...change,
        body:
          change.body.kind === "rank"
            ? { kind: "rank", input: createCheckScheduleSchema.parse(change.body.input) }
            : {
                kind: "ai",
                input: stampAppScheduleInput(
                  change.body.input,
                  actor.id,
                ) as typeof change.body.input,
              },
      };
    if (change.op === "update") {
      const body = change.body;
      if (body.kind === "rank")
        change = {
          ...change,
          body: { kind: "rank", input: updateCheckScheduleSchema.parse(body.input) },
        };
      if (body.kind === "rank-membership")
        change = {
          ...change,
          body: { ...body, membership: checkScheduleMembershipSchema.parse(body.membership) },
        };
      if (body.kind === "ai")
        change = {
          ...change,
          body: {
            kind: "ai",
            input: stampAppScheduleInput(body.input, actor.id) as typeof body.input,
          },
        };
    }
    const permission = scheduleReviewPermission(change);
    const project = await requireProjectScope(actor, permission.action, parsed.data.projectId, {
      type: permission.type,
    });
    return previewScheduleChange(project.id, actor, change);
  });
}
