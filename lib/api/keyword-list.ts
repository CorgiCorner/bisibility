import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Device, type Prisma } from "@/lib/generated/prisma/client";
import { LocationInputError, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { type ApiContext, forbidden, projectMatches } from "./context";
import { ApiInputError } from "./errors";
import { type KeywordListQuery, parseKeywordListQuery } from "./keyword-list-query";
import { legacyMarketFilterValues } from "./legacy-market-input";
import {
  decodeCursor,
  decodeOffsetCursor,
  encodeCursor,
  encodeOffsetCursor,
  splitPage,
} from "./pagination";
import { keywordInclude, keywordResources } from "./resources";
import { listResponse } from "./responses";

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
