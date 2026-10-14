import "server-only";
import { referenceSchema } from "@/lib/business-locations/schema";
import { z } from "zod";
import { businessDigest } from "./canonical";
import { BusinessLocationConflictError } from "./errors";
import { MAX_MATCH_BATCH_ITEMS } from "./schema";

const instant = z.iso.datetime({ precision: 3 });
const anchor = z
  .object({
    ordinal: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    itemId: referenceSchema,
  })
  .strict();
const cursorSchema = z
  .object({
    version: z.literal(1),
    projectId: referenceSchema,
    locationId: referenceSchema,
    runId: referenceSchema,
    identityRevisionId: referenceSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    watermark: instant,
    after: anchor.nullable(),
  })
  .strict();
export const businessReviewSelectionSchema = z
  .object({
    cursor: z.string().min(1).max(8000).nullable().default(null),
    mode: z.enum(["continue", "refresh"]).default("continue"),
  })
  .strict();
export type BusinessReviewSelection = z.input<typeof businessReviewSelectionSchema>;
type Cursor = z.infer<typeof cursorSchema>;
export type ReviewScope = Pick<
  Cursor,
  "projectId" | "locationId" | "runId" | "identityRevisionId" | "sourceHash"
>;
function refused(): never {
  throw new BusinessLocationConflictError("review_cursor_conflict");
}
function decode(value: string): Cursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) return refused();
    const raw = Buffer.from(value, "base64url");
    if (raw.toString("base64url") !== value) return refused();
    return cursorSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    return refused();
  }
}
function encode(value: Cursor) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
export function reviewWatermark(input: unknown, now: Date) {
  const selection = businessReviewSelectionSchema.parse(input ?? {});
  const retained = selection.cursor ? decode(selection.cursor) : null;
  if (
    !Number.isFinite(now.getTime()) ||
    (retained && Date.parse(retained.watermark) > now.getTime())
  )
    return refused();
  return {
    selection,
    retained,
    watermark: selection.mode === "refresh" || !retained ? now.toISOString() : retained.watermark,
  };
}
/** Original item facts bind the page; decision versions remain separately CAS-protected. */
export function businessReviewSourceHash(run: {
  id: string;
  provider: string;
  surface: string;
  engine: string;
  requestPolicy: unknown;
  items: readonly { id: string; ordinal: number; observedAt: Date | null; rawFragment: unknown }[];
}) {
  return businessDigest({
    ...run,
    items: run.items.map(({ rawFragment: _raw, observedAt, ...item }) => ({
      ...item,
      observedAt: observedAt?.toISOString() ?? null,
      rawFragmentHash: businessDigest(_raw),
    })),
  });
}
export function selectBusinessReviewPage<T extends { id: string; ordinal: number }>(
  items: readonly T[],
  scope: ReviewScope,
  state: ReturnType<typeof reviewWatermark>,
) {
  const retained = state.retained;
  if (
    retained &&
    (Object.keys(scope) as (keyof ReviewScope)[]).some((key) => retained[key] !== scope[key])
  )
    return refused();
  const ordered = [...items].sort(
    (a, b) => a.ordinal - b.ordinal || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const afterIndex = retained?.after
    ? ordered.findIndex(
        (item) => item.id === retained.after?.itemId && item.ordinal === retained.after.ordinal,
      )
    : -1;
  if (retained?.after && afterIndex < 0) return refused();
  const offset = afterIndex + 1,
    selected = ordered.slice(offset, offset + MAX_MATCH_BATCH_ITEMS);
  const at = (index: number) =>
    index < 0 ? null : { ordinal: ordered[index].ordinal, itemId: ordered[index].id };
  const cursor = (after: Cursor["after"]) =>
    encode({ version: 1, ...scope, watermark: state.watermark, after });
  return {
    selected,
    offset,
    watermark: state.watermark,
    cursor: cursor(at(offset - 1)),
    nextCursor:
      offset + selected.length < ordered.length ? cursor(at(offset + selected.length - 1)) : null,
    previousCursor: offset > 0 ? cursor(at(Math.max(0, offset - MAX_MATCH_BATCH_ITEMS) - 1)) : null,
  };
}
