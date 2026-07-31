import "server-only";

import { createHash } from "node:crypto";
import { keywordCreateItemSchema } from "@/lib/api/schemas";
import { parsePublicId } from "@/lib/db/public-id";
import {
  CLOUD_MIGRATION_PACKAGE_VERSION,
  LEGACY_CLOUD_MIGRATION_PACKAGE_VERSION,
} from "@/lib/migration/package-version";
import { z } from "zod";
import { cloudImportBodySchema, importKeywordSchema } from "./schemas";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const body = record(value);
  if (!body) throw new Error("Chunk checksum payload must be JSON.");
  return `{${Object.keys(body)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(body[key])}`)
    .join(",")}}`;
}

type ChunkChecksumPayload = {
  kind: string;
  keywords?: unknown;
  sections?: unknown;
};

function importChunkChecksumForVersion(payload: ChunkChecksumPayload, version: 5 | 6) {
  return `sha256:${createHash("sha256")
    .update(canonicalJson({ version, ...payload }))
    .digest("hex")}`;
}

export function importChunkChecksum(payload: ChunkChecksumPayload) {
  return importChunkChecksumForVersion(payload, CLOUD_MIGRATION_PACKAGE_VERSION);
}

function checksumMatches(input: unknown) {
  const body = record(input);
  if (!body || typeof body.checksum !== "string" || typeof body.kind !== "string") return false;
  const payload =
    body.kind === "keywords"
      ? { kind: body.kind, keywords: body.keywords }
      : body.kind === "sections"
        ? { kind: body.kind, sections: body.sections }
        : null;
  if (payload === null) return false;
  return [CLOUD_MIGRATION_PACKAGE_VERSION, LEGACY_CLOUD_MIGRATION_PACKAGE_VERSION].some(
    (version) => body.checksum === importChunkChecksumForVersion(payload, version),
  );
}

const checksumSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const strictProjectId = z.string().refine((value) => parsePublicId(value)?.prefix === "prj", {
  message: "Expected a strict prj_ v3 public ID.",
});
const strictKeywordId = z.string().refine((value) => parsePublicId(value)?.prefix === "kw", {
  message: "Expected a strict kw_ v3 public ID.",
});
export const importSessionIdSchema = z
  .string()
  .refine((value) => parsePublicId(value)?.prefix === "imp", {
    message: "Expected a strict lowercase imp_ v3 public ID.",
  });
const totalSchema = z.number().int().min(0);

export const importSessionCreateSchema = z
  .object({
    chunk_count: z.number().int().min(1).max(500),
    source_project_id: strictProjectId,
    totals: z
      .object({ keywords: totalSchema, rank_checks: totalSchema })
      .strict()
      .partial()
      .optional(),
    version: z.literal(CLOUD_MIGRATION_PACKAGE_VERSION),
  })
  .strict()
  .transform((value) => ({
    chunkCount: value.chunk_count,
    manifest: value,
    sourceProjectId: value.source_project_id,
  }));

const sourceKeywordSchema = z
  .object({
    device: keywordCreateItemSchema.shape.device.unwrap(),
    location: keywordCreateItemSchema.shape.location.unwrap(),
    text: keywordCreateItemSchema.shape.keyword,
  })
  .strict();
const sourceKeywordIdsSchema = z.record(strictKeywordId, sourceKeywordSchema).default({});

function sourceKeywordIds(input: unknown) {
  const body = record(input);
  return body?.source_keyword_ids ?? {};
}

const importSessionSectionsOuterSchema = z
  .object({
    alert_rules: z.unknown().optional(),
    competitors: z.unknown().optional(),
    notification_preferences: z.unknown().optional(),
    saved_views: z.unknown().optional(),
    source_keyword_ids: z.unknown().optional(),
  })
  .strict();

export const importSessionSectionsSchema = importSessionSectionsOuterSchema
  .superRefine((value, ctx) => {
    const parsed = cloudImportBodySchema.safeParse(value);
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
    const sources = sourceKeywordIdsSchema.safeParse(sourceKeywordIds(value));
    if (!sources.success) {
      for (const issue of sources.error.issues)
        ctx.addIssue({ ...issue, path: ["source_keyword_ids", ...issue.path] });
    }
  })
  .transform((value) => {
    const body = cloudImportBodySchema.parse(value);
    return {
      __sections: body.__sections,
      alertRules: body.alertRules,
      competitors: body.competitors,
      notificationPreferences: body.notificationPreferences,
      savedViews: body.savedViews,
      sourceKeywordIds: sourceKeywordIdsSchema.parse(sourceKeywordIds(value)),
    };
  });

const keywordChunkSchema = z
  .object({
    __checksumValid: z.literal(true),
    checksum: checksumSchema,
    keywords: z.array(importKeywordSchema).max(500),
    kind: z.literal("keywords"),
  })
  .strict()
  .superRefine((value, ctx) => {
    const rows = value.keywords.reduce(
      (total, keyword) => total + keyword.rankingHistory.length,
      0,
    );
    if (rows > 25_000)
      ctx.addIssue({
        code: "custom",
        message: "Chunk ranking history exceeds the maximum row count.",
        path: ["keywords"],
      });
  })
  .strict()
  .transform(({ __checksumValid: _checksumValid, ...value }) => value);
const sectionsChunkSchema = z
  .object({
    __checksumValid: z.literal(true),
    checksum: checksumSchema,
    kind: z.literal("sections"),
    sections: importSessionSectionsSchema,
  })
  .strict()
  .transform(({ __checksumValid: _checksumValid, ...value }) => value);

export const importSessionChunkSchema = z.preprocess(
  (value) => {
    const body = record(value);
    return body ? { ...body, __checksumValid: checksumMatches(body) } : value;
  },
  z.union([keywordChunkSchema, sectionsChunkSchema]),
);

export type ImportSessionChunk = z.infer<typeof importSessionChunkSchema>;
export type ImportSessionCreate = z.infer<typeof importSessionCreateSchema>;
export type ImportSessionSections = z.infer<typeof importSessionSectionsSchema>;
export type SourceKeywordIds = ImportSessionSections["sourceKeywordIds"];
