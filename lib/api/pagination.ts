import { isPublicIdOfType, isValidPublicId, type PublicIdPrefix } from "@/lib/db/public-id";
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

export function parseLimit(url: URL, fallback = 50, max = 200) {
  const raw = url.searchParams.get("limit");
  if (!raw) {
    return fallback;
  }

  return z.coerce.number().int().min(1).max(max).parse(raw);
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
  const limit = parseLimit(url, fallback, max);
  const offset = decodeOffsetCursor(url.searchParams.get("cursor"));
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const nextCursor = nextOffset < items.length ? encodeOffsetCursor(nextOffset) : null;

  return { nextCursor, page };
}
