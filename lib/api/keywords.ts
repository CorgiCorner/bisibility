import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { addTags } from "@/lib/actions/keyword-helpers";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { deleteKeywordTargets } from "@/lib/keywords/delete";
import {
  assertKeywordIdentityUnchanged,
  KeywordIdentityImmutableError,
} from "@/lib/keywords/identity";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";
import {
  commitKeywordCadence,
  type ReviewedKeywordCadence,
} from "@/lib/schedules/keyword-cadence-write";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import {
  resolveKeywordLocation,
  resolveKeywordLocationUsingStore,
} from "@/lib/serp/location-service";
import { type ApiContext, notFound } from "./context";
import { deferredKeywordLocations } from "./deferred-keyword-location";
import { ApiConflictError } from "./errors";
import {
  assertCadenceReviewNotRequired,
  ScheduleReviewRequiredError,
  scheduleReviewResponse,
} from "./keyword-cadence-review";
import { legacyKeywordCadenceChange, writeKeywordSchedule } from "./keyword-schedule-write";
import { assertSingleScheduleInput, scheduleFromPatch, scheduleSource } from "./keyword-utils";
import { legacyMarketLocationSelection } from "./legacy-market-input";
import { keywordInclude, keywordResources } from "./resources";
import { resourceResponse } from "./responses";
import { apiScheduleReviewer, withApiScheduleAudit } from "./schedule-reviewer";
import { keywordPatchSchema } from "./schemas";

export { listKeywords } from "./keyword-list";

export async function getKeyword(ctx: ApiContext, keywordId: string) {
  const keyword = await prisma.keyword.findFirst({
    include: keywordInclude,
    where: { projectId: ctx.auth.project.id, publicId: keywordId },
  });
  if (!keyword) {
    return notFound(ctx, "Keyword not found.");
  }

  return resourceResponse((await keywordResources([keyword], ctx.auth.project.publicId))[0], {
    headers: ctx.headers,
  });
}

export async function patchKeyword(ctx: ApiContext, keywordId: string) {
  const body = await ctx.req.json();
  const data = parseActionInput(keywordPatchSchema, body);
  assertSingleScheduleInput(data);
  const keyword = await prisma.keyword.findFirst({
    where: { projectId: ctx.auth.project.id, publicId: keywordId },
  });
  if (!keyword) {
    return notFound(ctx, "Keyword not found.");
  }

  const schedule = data.schedule_id === undefined ? scheduleFromPatch(data, keyword.id) : null;
  const country = data.location ?? data.country;
  // Legacy city input stays structured so the resolver can supply the city's region.
  const selection = data.location_key
    ? { canonicalKey: data.location_key, kind: "city" as const }
    : country || data.city
      ? legacyMarketLocationSelection({ city: data.city, country: country ?? keyword.location })
      : null;
  const deferred =
    (schedule || data.schedule_id !== undefined) && selection
      ? deferredKeywordLocations(prisma)
      : null;
  const locationInput = selection ? { projectId: ctx.auth.project.id, selection } : null;
  const resolved = locationInput
    ? await (deferred
        ? resolveKeywordLocationUsingStore(locationInput, deferred.store)
        : resolveKeywordLocation(locationInput))
    : null;
  try {
    assertKeywordIdentityUnchanged(keyword, {
      device: data.device,
      locationId: resolved?.location.id,
      text: data.keyword,
    });
  } catch (error) {
    if (error instanceof KeywordIdentityImmutableError) {
      throw new ApiConflictError(error.message);
    }
    throw error;
  }
  const mutate = async (tx: Prisma.TransactionClient, admission?: ReviewedKeywordCadence) => {
    if (schedule && !admission)
      await assertCadenceReviewNotRequired(tx, ctx.auth.project.id, [keyword.id], schedule);
    await prepareResourceCapacity(tx, { projectId: ctx.auth.project.id, dimensions: [] });
    if (deferred) await deferred.flush(tx);
    const updated = await tx.keyword.update({
      data: {
        device: data.device,
        location: resolved ? denormalizedLocationLabel(resolved.location) : undefined,
        locationId: resolved?.location.id,
        targetUrl: data.target_url,
        text: data.keyword,
        topic: data.topic,
        intent: data.intent,
      },
      include: keywordInclude,
      where: { id: keyword.id },
    });
    if (data.tags) {
      await tx.keywordTag.deleteMany({ where: { keywordId: keyword.id } });
      await addTags(tx, ctx.auth.project.id, [keyword.id], data.tags);
    }
    if (schedule) {
      await setKeywordCadence(
        tx,
        ctx.auth.project.id,
        [keyword.id],
        schedule,
        ctx.actorId ?? null,
        scheduleSource(data),
        ...(admission ? ([undefined, admission] as const) : []),
      );
    }

    await writeAudit(
      {
        action: "keyword.update",
        actorId: null,
        after: {
          intent: data.intent,
          keywordId,
          tags: data.tags,
          targetUrl: data.target_url,
          topic: data.topic,
        },
        before: { intent: keyword.intent, targetUrl: keyword.targetUrl, topic: keyword.topic },
        projectId: ctx.auth.project.id,
        targetId: keyword.publicId,
        targetType: "keyword",
      },
      tx,
    );

    return updated;
  };
  let updated: Awaited<ReturnType<typeof mutate>>;
  try {
    if (data.schedule_id !== undefined) {
      updated = await writeKeywordSchedule(
        ctx,
        [keyword.publicId],
        data.schedule_id,
        data.review,
        mutate,
      );
    } else if (schedule && data.review) {
      // Without a review the legacy cadence keeps its pre-schedules gate under the project lock.
      updated = await withApiScheduleAudit(ctx, () =>
        commitKeywordCadence(
          ctx.auth.project.id,
          apiScheduleReviewer(ctx),
          legacyKeywordCadenceChange([keyword.publicId], schedule, scheduleSource(data)),
          data.review,
          mutate,
        ),
      );
    } else {
      updated = await prisma.$transaction(mutate);
    }
  } catch (error) {
    if (error instanceof ScheduleReviewRequiredError) return scheduleReviewResponse(ctx);
    throw error;
  }

  return getKeyword(ctx, updated.publicId);
}

export async function deleteKeyword(ctx: ApiContext, keywordId: string) {
  const keyword = await prisma.keyword.findFirst({
    include: keywordInclude,
    where: { projectId: ctx.auth.project.id, publicId: keywordId },
  });
  if (!keyword) {
    return notFound(ctx, "Keyword not found.");
  }

  // Serialize before the deletion; the checks are cascade-deleted with the keyword.
  const resource = (await keywordResources([keyword], ctx.auth.project.publicId))[0];
  await prisma.$transaction(async (tx) => {
    await deleteKeywordTargets(tx, ctx.auth.project.id, [keyword.publicId]);
    await writeAudit(
      {
        action: "keyword.delete",
        actorId: null,
        before: { keywordId: keyword.publicId, text: keyword.text },
        projectId: ctx.auth.project.id,
        targetId: keyword.publicId,
        targetType: "keyword",
      },
      tx,
    );
  });

  return resourceResponse(resource, {
    headers: ctx.headers,
  });
}
