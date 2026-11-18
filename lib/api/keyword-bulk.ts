import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { addTags } from "@/lib/actions/keyword-helpers";
import { writeAudit } from "@/lib/auth/audit";
import { canProjectAction } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { deleteKeywordTargets } from "@/lib/keywords/delete";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";
import {
  commitKeywordCadence,
  type ReviewedKeywordCadence,
} from "@/lib/schedules/keyword-cadence-write";
import { type ApiContext, actorProjectRole, forbidden } from "./context";
import {
  assertCadenceReviewNotRequired,
  ScheduleReviewRequiredError,
  scheduleReviewResponse,
} from "./keyword-cadence-review";
import { legacyKeywordCadenceChange, writeKeywordSchedule } from "./keyword-schedule-write";
import { assertSingleScheduleInput, scheduleFromBulk, scheduleSource } from "./keyword-utils";
import { requireApiPublicId } from "./public-id";
import { resourceResponse } from "./responses";
import { apiScheduleReviewer, withApiScheduleAudit } from "./schedule-reviewer";
import { type ApiKeywordBulk, keywordBulkSchema } from "./schemas";

type BulkKeyword = {
  id: string;
  publicId: string;
};

function byRequestedId(keywords: BulkKeyword[]) {
  const map = new Map<string, BulkKeyword>();
  for (const keyword of keywords) {
    map.set(keyword.publicId, keyword);
  }
  return map;
}

function results(ids: string[], map: Map<string, BulkKeyword>, status: string) {
  return ids.map((id) => {
    const keyword = map.get(id);
    return keyword
      ? { keyword_id: keyword.publicId, status }
      : { keyword_id: id, status: "not_found" };
  });
}

export async function bulkKeywords(ctx: ApiContext) {
  try {
    const body = await ctx.req.json();
    const data = parseActionInput(keywordBulkSchema, body);
    assertSingleScheduleInput(data);
    // Deleting keywords is admin-only in the app (delete/keyword); the write tier alone is not enough.
    if (
      data.operation === "delete" &&
      !canProjectAction(actorProjectRole(ctx), "delete", "keyword")
    ) {
      return forbidden(ctx, "Your project role does not allow deleting keywords.");
    }
    const keywordIds = data.keyword_ids.map((id) => requireApiPublicId(id, "kw"));
    const keywords =
      (data.operation === "set_schedule" || data.operation === "set_frequency") &&
      data.schedule_id !== undefined
        ? await writeKeywordSchedule(ctx, keywordIds, data.schedule_id, data.review, (tx) =>
            tx.keyword.findMany({
              select: { id: true, publicId: true },
              where: {
                publicId: { in: keywordIds },
                projectId: ctx.auth.project.id,
                archivedAt: null,
              },
            }),
          )
        : data.operation === "delete"
          ? await prisma.$transaction((tx) =>
              deleteKeywordTargets(tx, ctx.auth.project.id, keywordIds),
            )
          : data.operation === "set_frequency"
            ? await bulkLegacyCadence(ctx, keywordIds, data)
            : await prisma.keyword.findMany({
                select: { id: true, publicId: true },
                where: {
                  publicId: { in: keywordIds },
                  projectId: ctx.auth.project.id,
                },
              });
    const map = byRequestedId(keywords);
    const foundIds = keywords.map((keyword) => keyword.id);
    const responseStatus = data.operation === "delete" ? "deleted" : "updated";

    if (data.operation === "set_target_url") {
      await prisma.keyword.updateMany({
        data: { targetUrl: data.target_url ?? null },
        where: { id: { in: foundIds } },
      });
    } else if (data.operation === "add_tags") {
      await addTags(prisma, ctx.auth.project.id, foundIds, data.tags ?? []);
    } else if (data.operation === "remove_tags") {
      const tags = await prisma.tag.findMany({
        select: { id: true },
        where: { name: { in: data.tags ?? [] }, projectId: ctx.auth.project.id },
      });
      await prisma.keywordTag.deleteMany({
        where: { keywordId: { in: foundIds }, tagId: { in: tags.map((tag) => tag.id) } },
      });
    }

    await writeAudit({
      action: `keyword.bulk.${data.operation}`,
      actorId: null,
      after: { count: foundIds.length, operation: data.operation },
      projectId: ctx.auth.project.id,
      targetId: ctx.auth.project.publicId,
      targetType: "project",
    });

    return resourceResponse(
      { operation: data.operation, results: results(data.keyword_ids, map, responseStatus) },
      { headers: ctx.headers },
    );
  } catch (error) {
    if (error instanceof ScheduleReviewRequiredError) return scheduleReviewResponse(ctx);
    throw error;
  }
}

async function bulkLegacyCadence(ctx: ApiContext, keywordIds: string[], data: ApiKeywordBulk) {
  const projectId = ctx.auth.project.id;
  const schedule = scheduleFromBulk(data, keywordIds[0]);
  if (!schedule) return [];
  const source = scheduleSource(data);
  const run = async (tx: Prisma.TransactionClient, admission?: ReviewedKeywordCadence) => {
    const found = await tx.keyword.findMany({
      select: { id: true, publicId: true },
      where: { publicId: { in: keywordIds }, projectId, archivedAt: null },
    });
    const ids = found.map((keyword) => keyword.id);
    if (!admission) await assertCadenceReviewNotRequired(tx, projectId, ids, schedule);
    const processed = await setKeywordCadence(
      tx,
      projectId,
      ids,
      schedule,
      ctx.actorId ?? null,
      source,
      ...(admission ? ([undefined, admission] as const) : []),
    );
    return found.filter((keyword) => processed.has(keyword.id));
  };
  // Without a review the legacy cadence keeps its pre-schedules gate under the project lock.
  return data.review
    ? withApiScheduleAudit(ctx, () =>
        commitKeywordCadence(
          projectId,
          apiScheduleReviewer(ctx),
          legacyKeywordCadenceChange(keywordIds, schedule, source),
          data.review,
          run,
        ),
      )
    : prisma.$transaction(run);
}
