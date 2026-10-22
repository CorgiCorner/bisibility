import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { addTags } from "@/lib/actions/keyword-helpers";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { Device, type Prisma } from "@/lib/generated/prisma/client";
import { deleteKeywordTargets } from "@/lib/keywords/delete";
import {
  assertKeywordIdentityUnchanged,
  KeywordIdentityImmutableError,
} from "@/lib/keywords/identity";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";
import { LocationInputError, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { type ApiContext, forbidden, notFound, projectMatches } from "./context";
import { ApiConflictError, ApiInputError } from "./errors";
import { type KeywordListQuery, parseKeywordListQuery } from "./keyword-list-query";
import { scheduleFromPatch } from "./keyword-utils";
import { legacyMarketFilterValues, legacyMarketLocationSelection } from "./legacy-market-input";
import {
  decodeCursor,
  decodeOffsetCursor,
  encodeCursor,
  encodeOffsetCursor,
  splitPage,
} from "./pagination";
import { keywordInclude, keywordResources } from "./resources";
import { listResponse, resourceResponse } from "./responses";
import { keywordPatchSchema } from "./schemas";

function locationKeyParam(raw: string | undefined) {
  if (!raw) {
    return null;
  }
  try {
    return normalizeCanonicalLocationKey(raw).canonicalKey;
  } catch (error) {
    if (error instanceof LocationInputError) {
      throw new ApiInputError(
        "location_key must be a canonical location key such as US or US/Texas/Austin.",
      );
    }
    throw error;
  }
}

function keywordWhere(ctx: ApiContext, query: KeywordListQuery) {
  const where: Prisma.KeywordWhereInput = { projectId: ctx.auth.project.id };
  const and: Prisma.KeywordWhereInput[] = [];
  const { country, device, intent, search, tag, topic } = query;
  const locationKey = locationKeyParam(query.location_key);
  const positionGt = query.position_gt ?? null;
  const positionLt = query.position_lt ?? null;

  if (device) {
    where.device = device === "mobile" ? Device.mobile : Device.desktop;
  }
  if (country) {
    and.push({
      OR: legacyMarketFilterValues(country).map((location) => ({
        location: { equals: location, mode: "insensitive" },
      })),
    });
  }
  if (locationKey) {
    where.locationRef = { canonicalKey: locationKey };
  }
  if (search) {
    where.text = { contains: search, mode: "insensitive" };
  }
  if (tag) {
    where.tags = { some: { tag: { name: { equals: tag, mode: "insensitive" } } } };
  }
  if (topic) {
    where.topic = { equals: topic, mode: "insensitive" };
  }
  if (intent) {
    where.intent = { equals: intent, mode: "insensitive" };
  }
  if (positionGt !== null || positionLt !== null) {
    where.rankChecks = {
      some: { position: { gt: positionGt ?? undefined, lt: positionLt ?? undefined } },
    };
  }
  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

function orderBy(sort: string): Prisma.KeywordOrderByWithRelationInput[] {
  const direction = sort.startsWith("-") ? "desc" : "asc";
  const field = sort.replace(/^-/, "");

  if (field === "keyword" || field === "text") {
    return [{ text: direction }, { publicId: direction }];
  }
  if (field === "updated_at") {
    return [{ updatedAt: direction }, { publicId: direction }];
  }
  return [{ createdAt: direction }, { publicId: direction }];
}

export async function listKeywords(ctx: ApiContext, projectId: string) {
  if (!projectMatches(ctx.auth, projectId)) {
    return forbidden(ctx, "API key is not scoped to this project.");
  }

  const query = parseKeywordListQuery(ctx.url);
  const limit = query.limit ?? 50;
  const sort = query.sort ?? "-created_at";
  const keysetPagination = sort === "-created_at";
  const rawCursor = query.cursor ?? null;
  const cursor = keysetPagination ? decodeCursor(rawCursor, "kw") : null;
  const offset = keysetPagination ? 0 : decodeOffsetCursor(rawCursor);
  const where = keywordWhere(ctx, query);
  if (cursor) {
    where.OR = [
      { createdAt: { lt: new Date(cursor.t) } },
      { createdAt: new Date(cursor.t), publicId: { lt: cursor.public_id } },
    ];
  }

  const keywords = await prisma.keyword.findMany({
    include: keywordInclude,
    orderBy: orderBy(sort),
    skip: keysetPagination ? undefined : offset,
    take: limit + 1,
    where,
  });
  const { nextCursor, page } = splitPage(keywords, limit, (keyword) =>
    keysetPagination
      ? encodeCursor({ publicId: keyword.publicId, timestamp: keyword.createdAt }, "kw")
      : encodeOffsetCursor(offset + limit),
  );

  return listResponse(await keywordResources(page, ctx.auth.project.publicId), nextCursor, {
    headers: ctx.headers,
  });
}

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
  const keyword = await prisma.keyword.findFirst({
    where: { projectId: ctx.auth.project.id, publicId: keywordId },
  });
  if (!keyword) {
    return notFound(ctx, "Keyword not found.");
  }

  const schedule = scheduleFromPatch(data, keyword.id);
  const country = data.location ?? data.country;
  // Legacy city input stays structured so the resolver can supply the city's region.
  const selection = data.location_key
    ? { canonicalKey: data.location_key, kind: "city" as const }
    : country || data.city
      ? legacyMarketLocationSelection({ city: data.city, country: country ?? keyword.location })
      : null;
  const resolved = selection
    ? await resolveKeywordLocation({
        projectId: ctx.auth.project.id,
        selection,
      })
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
  const updated = await prisma.keyword.update({
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
    await prisma.keywordTag.deleteMany({ where: { keywordId: keyword.id } });
    await addTags(prisma, ctx.auth.project.id, [keyword.id], data.tags);
  }
  if (schedule) {
    await prisma.$transaction(async (tx) => {
      await setKeywordCadence(tx, ctx.auth.project.id, [keyword.id], schedule, ctx.actorId ?? null);
    });
  }

  await writeAudit({
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
  });

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
