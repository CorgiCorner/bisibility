import { domainMatches } from "@/lib/domains/normalize";
import { z } from "zod";
import {
  type SerpSnapshotContinuation,
  SNAPSHOT_EXTENSION_WINDOW_MS,
  type SnapshotExtensionState,
  type SnapshotExtensionView,
} from "./snapshot-extension";

const continuationSchema = z.object({
  version: z.literal(1),
  capturedAt: z.iso.datetime(),
  keyword: z.string().min(1),
  domain: z.string().min(1),
  device: z.enum(["desktop", "mobile"]),
  connectionId: z.string().min(1).optional(),
  location: z.object({
    gl: z.string().min(1),
    hl: z.string().min(1),
    primaryGeoCode: z.number().nullable(),
    primaryGeoName: z.string(),
    secondaryGeoName: z.string().min(1),
  }),
  nextStart: z.number().int().min(10).max(100).multipleOf(10),
  ended: z.boolean(),
});
const rowSchema = z.object({
  rank: z.number().int().min(1).max(100),
  url: z.url(),
  domain: z.string().nullable(),
  title: z.string().nullable(),
});
const extensionSchema = z.object({
  version: z.literal(1),
  state: z.enum(["idle", "running", "failed"]),
  nextStart: z.number().int().min(10).max(100).multipleOf(10),
  ended: z.boolean(),
  requestId: z.string().optional(),
  leaseUntil: z.iso.datetime().optional(),
  pages: z
    .array(
      z.object({
        start: z.number().int().min(10).max(90).multipleOf(10),
        fetchedAt: z.iso.datetime(),
        skippedDuplicates: z.number().int().min(0),
        rows: z.array(rowSchema).max(10),
      }),
    )
    .max(9),
});

export function readSnapshotContinuation(raw: unknown): SerpSnapshotContinuation | null {
  const parsed = continuationSchema.safeParse(
    (raw as Record<string, unknown> | null)?.snapshotContinuation,
  );
  return parsed.success ? parsed.data : null;
}

export function readSnapshotExtension(
  raw: unknown,
  continuation: SerpSnapshotContinuation,
): SnapshotExtensionState | null {
  const stored = (raw as Record<string, unknown> | null)?.snapshotExtension;
  if (stored === undefined)
    return {
      version: 1,
      state: "idle",
      nextStart: continuation.nextStart,
      ended: continuation.ended,
      pages: [],
    };
  const parsed = extensionSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export function snapshotExtensionView(
  provider: string,
  raw: unknown,
  now = new Date(),
): SnapshotExtensionView {
  const unavailable = (reason: SnapshotExtensionView["reason"]): SnapshotExtensionView => ({
    reason,
    expiresAt: null,
    nextStart: null,
    pages: [],
  });
  if (provider !== "serpapi") return unavailable("unsupported");
  const continuation = readSnapshotContinuation(raw);
  if (!continuation?.connectionId) return unavailable("legacy");
  const extension = readSnapshotExtension(raw, continuation);
  if (!extension) return unavailable("failed");
  const expiry = Date.parse(continuation.capturedAt) + SNAPSHOT_EXTENSION_WINDOW_MS;
  const reason =
    extension.state === "running"
      ? extension.leaseUntil && Date.parse(extension.leaseUntil) > now.getTime()
        ? "running"
        : "failed"
      : extension.state === "failed"
        ? "failed"
        : extension.ended || extension.nextStart >= 100
          ? "complete"
          : now.getTime() >= expiry || now.getTime() < Date.parse(continuation.capturedAt)
            ? "expired"
            : "available";
  return {
    reason,
    expiresAt: new Date(expiry).toISOString(),
    nextStart: extension.nextStart,
    pages: extension.pages.map((page) => ({
      ...page,
      rows: page.rows.map((row) => ({
        position: row.rank,
        url: row.url,
        domain: row.domain ?? "",
        title: row.title,
        tracked: domainMatches(row.domain ?? "", continuation.domain),
      })),
    })),
  };
}
