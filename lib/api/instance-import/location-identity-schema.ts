import "server-only";

import { legacyMarketNameSchema } from "@/lib/api/legacy-market-input";
import { keywordCreateItemSchema } from "@/lib/api/schemas";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import { canonicalKeySchema } from "@/lib/schemas/keyword";
import { normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { z } from "zod";

const strictPublicId = (prefix: PublicIdPrefix) =>
  z.string().refine((value) => parsePublicId(value)?.prefix === prefix, {
    message: `Expected a strict ${prefix}_ v3 public ID.`,
  });

const keywordTargetSchema = z
  .object({
    device: keywordCreateItemSchema.shape.device.optional(),
    keyword: keywordCreateItemSchema.shape.keyword.optional(),
    keyword_id: strictPublicId("kw"),
    location: z.string().trim().min(1).max(240).optional(),
    location_key: canonicalKeySchema.optional(),
    type: z.literal("keyword"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.location_key !== undefined || value.location === undefined) return;
    const parsed = legacyMarketNameSchema.safeParse(value.location);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ["location", ...issue.path] });
      }
    }
  })
  .transform((value) => ({
    device: value.device,
    keyword: value.keyword,
    keywordId: value.keyword_id,
    location:
      value.location_key === undefined && value.location !== undefined
        ? legacyMarketNameSchema.parse(value.location)
        : value.location,
    location_key: value.location_key
      ? normalizeCanonicalLocationKey(value.location_key).canonicalKey
      : undefined,
    tag: undefined,
    type: value.type,
  }));

const tagTargetSchema = z
  .object({ tag: z.string().min(1).max(80), type: z.literal("tag") })
  .strict()
  .transform((value) => ({
    ...value,
    keyword: undefined,
    keywordId: undefined,
    location: undefined,
    location_key: undefined,
  }));

export const alertRuleTargetSchema = z.union([keywordTargetSchema, tagTargetSchema]);
