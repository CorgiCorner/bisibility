import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ScheduleMutationError, scheduleNotFound } from "@/lib/schedules/errors";
import { scheduleMessage } from "@/lib/schedules/messages";
import { createSchedule, setScheduleState, updateSchedule } from "@/lib/schedules/mutations";
import { previewScheduleChange, type ScheduleChange } from "@/lib/schedules/preview";
import type { ScheduleReviewSubmission } from "@/lib/schedules/review-commit";
import { getSchedule } from "@/lib/schedules/service";
import { auditTrackingCatalog } from "./ai-tracking-audit";
import { type ApiContext, notFound, projectMatches, requireApiActor } from "./context";
import { ApiInputError } from "./errors";
import { keywordCreatePreviewChange } from "./keyword-create";
import {
  legacyKeywordCadenceChange,
  prepareKeywordScheduleAssignment,
} from "./keyword-schedule-write";
import { assertSingleScheduleInput, scheduleFromBulk, scheduleSource } from "./keyword-utils";
import { resourceResponse } from "./responses";
import { scheduleResource } from "./schedule-resource";
import { apiScheduleReviewer, withApiScheduleAudit } from "./schedule-reviewer";
import { publicScheduleCreateChange, publicScheduleUpdateChange } from "./schedule-write-change";
import { publicSchedulePreviewBody } from "./schedule-write-input";
import { authorizePublicScheduleChange } from "./schedule-write-permission";
import { keywordBulkSchema } from "./schemas";
import { readJsonBody } from "./surface";

export async function previewPublicSchedule(ctx: ApiContext) {
  if (!projectMatches(ctx.auth, ctx.path[1])) return notFound(ctx, "Project not found.");
  const input = publicSchedulePreviewBody.parse(await readJsonBody(ctx));
  const project = ctx.auth.project;
  let change: ScheduleChange;
  if (input.operation === "create") {
    change = publicScheduleCreateChange(ctx, input.schedule).change;
  } else if (input.operation === "update") {
    change = publicScheduleUpdateChange(ctx, input.schedule_id, input.schedule).change;
  } else if (input.operation === "set_schedule") {
    change = await prepareKeywordScheduleAssignment(ctx, input.keyword_ids, input.schedule_id);
  } else if (input.operation === "set_frequency") {
    const parsed = keywordBulkSchema.parse(input);
    assertSingleScheduleInput(parsed);
    const schedule = scheduleFromBulk(parsed, parsed.keyword_ids[0]);
    if (!schedule) throw new ApiInputError("A cadence is required.");
    change = legacyKeywordCadenceChange(parsed.keyword_ids, schedule, scheduleSource(parsed));
  } else {
    change = await keywordCreatePreviewChange(ctx, input.keywords);
  }
  change = await prepareChange(ctx, change);
  return resourceResponse(
    await previewScheduleChange(project.id, apiScheduleReviewer(ctx), change),
    { headers: ctx.headers },
  );
}

export async function createPublicSchedule(ctx: ApiContext) {
  if (!projectMatches(ctx.auth, ctx.path[1])) return notFound(ctx, "Project not found.");
  const { change, review } = publicScheduleCreateChange(ctx, await readJsonBody(ctx));
  const prepared = await prepareChange(ctx, change);
  return withApiScheduleAudit(ctx, () => writePublicSchedule(ctx, prepared, review));
}

export async function updatePublicSchedule(ctx: ApiContext) {
  if (!projectMatches(ctx.auth, ctx.path[1])) return notFound(ctx, "Project not found.");
  const { change, review } = publicScheduleUpdateChange(ctx, ctx.path[3], await readJsonBody(ctx));
  const prepared = await prepareChange(ctx, change);
  return withApiScheduleAudit(ctx, () => writePublicSchedule(ctx, prepared, review));
}

async function prepareChange(ctx: ApiContext, change: ScheduleChange): Promise<ScheduleChange> {
  const { id: projectId, publicId: projectPublicId } = ctx.auth.project;
  await authorizePublicScheduleChange(ctx, change);
  if (change.op === "update" && change.body.kind === "rank-membership") {
    await prepareKeywordScheduleAssignment(ctx, change.body.membership.keywordIds, change.id);
  }
  if (change.op !== "state" && change.op !== "update") return change;
  const current = await getSchedule(projectId, change.id);
  if (!current) throw scheduleNotFound();
  if (change.op !== "state" || change.command.kind !== "local_monitor") return change;
  if (change.state === "active") {
    if (current.state !== "active" && ctx.path[3] !== "preview")
      throw new ScheduleMutationError(
        "schedule_local_approval_required",
        scheduleMessage("transition"),
      );
    return change;
  }
  const monitor = await prisma.localMonitor.findFirst({
    where: { projectId, publicId: change.id },
    select: { version: true },
  });
  if (!monitor) throw scheduleNotFound();
  return {
    ...change,
    command: {
      ...change.command,
      local: {
        expectedVersion: monitor.version,
        idempotencyKey: `schedule-${change.id}-${monitor.version}-${change.state}`,
        monitorId: change.id,
        projectId: projectPublicId,
      },
    },
  };
}

async function writePublicSchedule(
  ctx: ApiContext,
  change: ScheduleChange,
  review?: ScheduleReviewSubmission,
) {
  const project = ctx.auth.project;
  const actor = requireApiActor(ctx);
  const options = { atomic: true, gate: true, review, reviewPrincipal: apiScheduleReviewer(ctx) };
  let id: string;
  if (change.op === "create") {
    const result = await createSchedule(project.id, actor, change.body, options);
    if (!("publicId" in result)) throw scheduleNotFound();
    id = result.publicId;
    if (change.body.kind === "ai") {
      await auditTrackingCatalog(actor, project, "schedules", "POST", change.body.input, result);
    }
  } else if (change.op === "state" || change.op === "update") {
    id = change.id;
    const result =
      change.op === "state"
        ? await setScheduleState(project.id, actor, id, change.state, change.command, options)
        : await updateSchedule(project.id, actor, id, change.body, options);
    if (
      (change.op === "state" && change.command.kind === "ai") ||
      (change.op === "update" && change.body.kind === "ai")
    ) {
      const archive = change.op === "state" && change.state === "archived";
      if (!("publicId" in result)) throw scheduleNotFound();
      await auditTrackingCatalog(
        actor,
        project,
        "schedules",
        archive ? "DELETE" : "PATCH",
        change.op === "update" && change.body.kind === "ai"
          ? change.body.input
          : { enabled: change.op === "state" && change.state === "active" },
        result,
      );
    }
  } else {
    throw new Error("Unsupported public schedule write.");
  }
  const saved = await getSchedule(project.id, id);
  if (!saved) throw scheduleNotFound();
  return resourceResponse(scheduleResource(saved), {
    headers: ctx.headers,
    status: change.op === "create" ? 201 : 200,
  });
}
