import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { addTags } from "@/lib/actions/keyword-helpers";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { Device, type Prisma } from "@/lib/generated/prisma/client";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { intentSchema, topicSchema } from "@/lib/schemas/keyword";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { serpMarketLocationValues } from "@/lib/serp/markets";
import { type ApiContext, forbidden, notFound, projectMatches } from "./context";
import { ApiInputError } from "./errors";
import { scheduleFromPatch } from "./keyword-utils";
import {
  decodeCursor,
  decodeOffsetCursor,
  encodeCursor,
  encodeOffsetCursor,
  parseLimit,
  splitPage,
} from "./pagination";
import { keywordInclude, keywordResource } from "./resources";
import { listResponse, resourceResponse } from "./responses";
import { keywordPatchSchema } from "./schemas";

function textParam(url: URL, ...names: string[]) {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value) {
      return value;
    }
  }
  return null;
}

function numberParam(url: URL, ...names: string[]) {
  const raw = textParam(url, ...names);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ApiInputError(`${names[0]} must be a number.`);
  }
  return value;
}

function metadataParam(
  url: URL,
  schema: typeof topicSchema,
  label: "intent" | "topic",
  ...names: string[]
) {
  const raw = textParam(url, ...names);
  if (!raw) {
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success || !parsed.data) {
    throw new ApiInputError(`${label} must be a non-empty string up to 80 characters.`);
  }
  return parsed.data;
}

function keywordWhere(ctx: ApiContext) {
  const where: Prisma.KeywordWhereInput = { projectId: ctx.auth.project.id };
  const and: Prisma.KeywordWhereInput[] = [];
  const device = textParam(ctx.url, "filter[device]", "device");
  const country = textParam(ctx.url, "filter[country]", "country");
  const intent = metadataParam(ctx.url, intentSchema, "intent", "filter[intent]", "intent");
  const search = textParam(ctx.url, "search", "q");
  const tag = textParam(ctx.url, "filter[tag]", "tag");
  const topic = metadataParam(ctx.url, topicSchema, "topic", "filter[topic]", "topic");
  const positionGt = numberParam(ctx.url, "filter[position_gt]", "position_gt");
  const positionLt = numberParam(ctx.url, "filter[position_lt]", "position_lt");

  if (device) {
    if (device !== "desktop" && device !== "mobile") {
      throw new ApiInputError("device must be desktop or mobile.");
    }
    where.device = device === "mobile" ? Device.mobile : Device.desktop;
  }
  if (country) {
    and.push({
      OR: serpMarketLocationValues(country).map((location) => ({
        location: { equals: location, mode: "insensitive" },
      })),
    });
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

function orderBy(url: URL): Prisma.KeywordOrderByWithRelationInput[] {
  const sort = url.searchParams.get("sort") ?? "-created_at";
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

  const limit = parseLimit(ctx.url, 50, 200);
  const sort = ctx.url.searchParams.get("sort") ?? "-created_at";
  const keysetPagination = sort === "-created_at";
  const rawCursor = ctx.url.searchParams.get("cursor");
  const cursor = keysetPagination ? decodeCursor(rawCursor, "kw") : null;
  const offset = keysetPagination ? 0 : decodeOffsetCursor(rawCursor);
  const where = keywordWhere(ctx);
  if (cursor) {
    where.OR = [
      { createdAt: { lt: new Date(cursor.t) } },
      { createdAt: new Date(cursor.t), publicId: { lt: cursor.public_id } },
    ];
  }

  const keywords = await prisma.keyword.findMany({
    include: keywordInclude,
    orderBy: orderBy(ctx.url),
    skip: keysetPagination ? undefined : offset,
    take: limit + 1,
    where,
  });
  const { nextCursor, page } = splitPage(keywords, limit, (keyword) =>
    keysetPagination
      ? encodeCursor({ publicId: keyword.publicId, timestamp: keyword.createdAt }, "kw")
      : encodeOffsetCursor(offset + limit),
  );

  return listResponse(
    page.map((keyword) => keywordResource(keyword, ctx.auth.project.publicId)),
    nextCursor,
    { headers: ctx.headers },
  );
}

export async function getKeyword(ctx: ApiContext, keywordId: string) {
  const keyword = await prisma.keyword.findFirst({
    include: keywordInclude,
    where: { projectId: ctx.auth.project.id, publicId: keywordId },
  });
  if (!keyword) {
    return notFound(ctx, "Keyword not found.");
  }

  return resourceResponse(keywordResource(keyword, ctx.auth.project.publicId), {
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
  let resolved = null;
  if (data.location_key) {
    resolved = await resolveKeywordLocation({
      projectId: ctx.auth.project.id,
      selection: { canonicalKey: data.location_key, kind: "city" },
    });
  } else if (country || data.city) {
    resolved = await resolveKeywordLocation({
      city: data.city,
      country: country ?? keyword.location,
      projectId: ctx.auth.project.id,
    });
  }
  const updated = await prisma.keyword.update({
    data: {
      device: data.device,
      location: resolved?.location.displayName ?? country,
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
      await tx.keywordSchedule.upsert({
        create: { ...schedule, keywordId: keyword.id },
        update: schedule,
        where: { keywordId: keyword.id },
      });
      await refreshKeywordDispatchStates({ keywordIds: [keyword.id] }, tx);
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

  await prisma.$transaction(async (tx) => {
    await tx.keyword.delete({ where: { id: keyword.id } });
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

  return resourceResponse(keywordResource(keyword, ctx.auth.project.publicId), {
    headers: ctx.headers,
  });
}
