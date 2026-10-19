import {
  isPublicIdOfType,
  isValidPublicId,
  type PublicIdPrefix,
} from "@/lib/db/public-id-resources";
import { z } from "zod";
import { ApiInputError } from "./errors";

const cursorSchema = z
  .object({
    public_id: z.string().refine(isValidPublicId, "public_id must be a v3 public ID."),
    t: z.iso.datetime(),
    v: z.literal(3),
  })
  .strict();
const offsetCursorSchema = z.object({ o: z.number().int().min(0), v: z.literal(3) }).strict();

export type Cursor = z.infer<typeof cursorSchema>;

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function encodeCursor(
  input: { publicId: string; timestamp: Date },
  expectedPrefix: PublicIdPrefix,
) {
  if (!isPublicIdOfType(input.publicId, expectedPrefix)) {
    throw new Error("Cannot encode a cursor with an unexpected public ID.");
  }
  return Buffer.from(
    JSON.stringify({ public_id: input.publicId, t: input.timestamp.toISOString(), v: 3 }),
  ).toString("base64url");
}

export function decodeCursor(value: string | null, expectedPrefix: PublicIdPrefix) {
  if (!value) {
    return null;
  }

  try {
    const cursor = cursorSchema.parse(JSON.parse(base64UrlDecode(value)));
    if (!isPublicIdOfType(cursor.public_id, expectedPrefix)) {
      throw new Error("Cursor public_id has an unexpected prefix.");
    }
    return cursor;
  } catch {
    throw new ApiInputError("Cursor must be a valid v3 cursor.", "invalid_cursor");
  }
}

const unprefixedCursorSchema = cursorSchema.extend({
  public_id: z.string().trim().min(1),
});

export function decodeUnprefixedCursor(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return unprefixedCursorSchema.parse(JSON.parse(base64UrlDecode(value)));
  } catch {
    throw new ApiInputError("Cursor must be a valid v3 cursor.", "invalid_cursor");
  }
}

export function encodeUnprefixedCursor(input: { publicId: string; timestamp: Date }) {
  return Buffer.from(
    JSON.stringify({ public_id: input.publicId, t: input.timestamp.toISOString(), v: 3 }),
  ).toString("base64url");
}

/**
 * The wire `limit`/`cursor` query of a list operation. It matches the shared OpenAPI `Limit`
 * and `Cursor` parameters when `max` is the default.
 */
export function pageQuerySchema(max = 200) {
  return z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(max).optional(),
  });
}

export const pageQuery = pageQuerySchema();

/** Empty values count as absent, as they always have for these parameters. */
export function parsePageQuery(url: URL, fallback = 50, max = 200) {
  const query = (max === 200 ? pageQuery : pageQuerySchema(max)).parse({
    cursor: url.searchParams.get("cursor") || undefined,
    limit: url.searchParams.get("limit") || undefined,
  });
  return { cursor: query.cursor ?? null, limit: query.limit ?? fallback };
}

export function parseLimit(url: URL, fallback = 50, max = 200) {
  return parsePageQuery(url, fallback, max).limit;
}

export function splitPage<T>(items: T[], limit: number, cursorFor: (item: T) => string) {
  const page = items.slice(0, limit);
  const next = items.length > limit ? cursorFor(page.at(-1) as T) : null;

  return { nextCursor: next, page };
}

export function encodeOffsetCursor(offset: number) {
  const parsed = z.number().int().min(0).parse(offset);
  return Buffer.from(JSON.stringify({ v: 3, o: parsed })).toString("base64url");
}

export function decodeOffsetCursor(value: string | null) {
  if (!value) {
    return 0;
  }

  try {
    return offsetCursorSchema.parse(JSON.parse(base64UrlDecode(value))).o;
  } catch {
    throw new ApiInputError("Cursor must be a valid v3 cursor.", "invalid_cursor");
  }
}

export function paginateArray<T>(url: URL, items: T[], fallback = 50, max = 200) {
  const { cursor, limit } = parsePageQuery(url, fallback, max);
  return paginateItems(items, { cursor, limit });
}

/** Offset-paginates items with an already validated page query. */
export function paginateItems<T>(items: T[], query: { cursor?: string | null; limit: number }) {
  const { limit } = query;
  const offset = decodeOffsetCursor(query.cursor ?? null);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const nextCursor = nextOffset < items.length ? encodeOffsetCursor(nextOffset) : null;

  return { nextCursor, page };
}
