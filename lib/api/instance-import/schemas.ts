import "server-only";

import { alertSeverities, defaultAlertSeverity } from "@/lib/alerts/severity";
import { keywordLocation } from "@/lib/api/keyword-utils";
import { keywordCreateItemSchema } from "@/lib/api/schemas";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import { normalizeDomain } from "@/lib/domains/normalize";
import { IMPORT_PACKAGE_MAX_KEYWORDS } from "@/lib/migration/package-limits";
import { savedViewSurfaceSchema } from "@/lib/saved-views/model";
import { z } from "zod";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const strictPublicId = (prefix: PublicIdPrefix) =>
  z.string().refine((value) => parsePublicId(value)?.prefix === prefix, {
    message: `Expected a strict ${prefix}_ v3 public ID.`,
  });
const locationSchema = keywordCreateItemSchema.shape.location.unwrap();
const nullableTextSchema = z.string().min(1).max(160).nullable().optional();
const nullableNumberSchema = z.number().nullable().optional();
const rankPositionSchema = z.number().int().min(1).nullable().optional();
const alertChannelSchema = z.enum(["email", "slack", "webhook"]);
const alertConditionSchema = z.enum([
  "change_pct",
  "competitor_overtake",
  "ctr_drop",
  "downtrend",
  "enters_top_n",
  "exits_top_n",
  "position_drop",
  "serp_feature",
  "threshold",
  "url_mismatch",
]);
const alertTargetSchema = z.enum(["all", "keyword", "tag"]);
const alertSeveritySchema = z.enum(alertSeverities);
const rankingUrlSchema = z
  .string()
  .max(500)
  .refine((value) => value.startsWith("/") || URL.canParse(value), {
    message: "Ranking URL must be an absolute URL or a path.",
  })
  .nullable()
  .optional();
const historySchema = z
  .object({
    checkedAt: z.iso.datetime().transform((value) => new Date(value)),
    position: rankPositionSchema,
    previousPosition: rankPositionSchema,
    rankingUrl: rankingUrlSchema,
  })
  .strict();
export const tokenSchema = z.string().min(20).max(256);
export const importKeywordSchema = z
  .object({
    device: keywordCreateItemSchema.shape.device,
    id: strictPublicId("kw"),
    keyword: keywordCreateItemSchema.shape.keyword,
    location: locationSchema,
    rankingHistory: z.array(historySchema).max(5000).default([]),
    tags: keywordCreateItemSchema.shape.tags,
    target_url: keywordCreateItemSchema.shape.target_url,
  })
  .strict()
  .transform((value) => ({
    device: value.device,
    id: value.id,
    keyword: value.keyword,
    location: keywordLocation(value),
    rankingHistory: value.rankingHistory,
    tags: value.tags,
    target_url: value.target_url ?? null,
  }));
const keywordTargetSchema = z
  .object({
    device: keywordCreateItemSchema.shape.device.optional(),
    keyword: keywordCreateItemSchema.shape.keyword.optional(),
    keyword_id: strictPublicId("kw"),
    location: locationSchema.optional(),
    type: z.literal("keyword"),
  })
  .strict()
  .transform((value) => ({
    device: value.device,
    keyword: value.keyword,
    keywordId: value.keyword_id,
    location: value.location,
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
  }));
const alertRuleTargetSchema = z.union([keywordTargetSchema, tagTargetSchema]);
const importAlertRuleSchema = z
  .object({
    change_pct: nullableNumberSchema,
    channels: z.array(alertChannelSchema).default([]),
    competitor_domain: nullableTextSchema,
    condition_type: alertConditionSchema.default("threshold"),
    drop_positions: rankPositionSchema,
    enabled: z.boolean().default(true),
    id: strictPublicId("alr"),
    name: z.string().min(1).max(120),
    serp_feature: nullableTextSchema,
    severity: alertSeveritySchema.optional(),
    target_type: alertTargetSchema.default("all"),
    targets: z.array(alertRuleTargetSchema).max(1000).default([]),
    threshold_position: rankPositionSchema,
    top_n: rankPositionSchema,
  })
  .strict()
  .transform((value) => ({
    changePct: value.change_pct ?? null,
    channels: value.channels,
    competitorDomain: value.competitor_domain ?? null,
    conditionType: value.condition_type,
    dropPositions: value.drop_positions ?? null,
    enabled: value.enabled,
    name: value.name,
    serpFeature: value.serp_feature ?? null,
    severity: value.severity ?? defaultAlertSeverity(value.condition_type),
    targetType: value.target_type,
    targets: value.targets,
    thresholdPosition: value.threshold_position ?? null,
    topN: value.top_n ?? null,
  }));
const competitorSchema = z
  .object({
    domain: z.string().min(1).max(253),
    id: strictPublicId("cmp"),
    label: z.string().max(80).nullable().optional(),
  })
  .strict()
  .transform((value, context) => {
    const domain = normalizeDomain(value.domain);
    if (!domain || domain !== value.domain) {
      context.addIssue({ code: "custom", message: "Competitor domain must be canonical." });
      return z.NEVER;
    }
    return { domain: value.domain, id: value.id, label: value.label ?? null };
  });
const savedViewSchema = z
  .object({
    config: z.unknown().default({}),
    id: strictPublicId("viw"),
    name: z.string().min(1).max(120),
    surface: savedViewSurfaceSchema.optional(),
  })
  .strict();
const notificationPreferenceSchema = z
  .object({
    alert_email: z.boolean().optional(),
    alert_in_app: z.boolean().optional(),
    check_email: z.boolean().optional(),
    check_in_app: z.boolean().optional(),
    import_email: z.boolean().optional(),
    import_in_app: z.boolean().optional(),
    invite_email: z.boolean().optional(),
    invite_in_app: z.boolean().optional(),
    report_email: z.boolean().optional(),
  })
  .strict()
  .transform((value) => ({
    alertEmail: value.alert_email ?? true,
    alertInApp: value.alert_in_app ?? true,
    checkEmail: value.check_email ?? false,
    checkInApp: value.check_in_app ?? false,
    importEmail: value.import_email ?? true,
    importInApp: value.import_in_app ?? true,
    inviteEmail: value.invite_email ?? true,
    inviteInApp: value.invite_in_app ?? true,
    reportEmail: value.report_email ?? true,
  }));
const bodyFields = new Set([
  "alert_rules",
  "competitors",
  "exported_at",
  "keywords",
  "notification_preferences",
  "project_id",
  "saved_views",
  "scope",
  "source_keyword_ids",
  "version",
]);
function normalizeSections(input: unknown) {
  const body = record(input);
  if (!body) return input;
  return {
    ...body,
    __bodyExtra: Object.keys(body).filter((key) => !bodyFields.has(key)),
    __sections: {
      alertRules: body.alert_rules !== undefined,
      competitors: body.competitors !== undefined,
      notificationPreferences: body.notification_preferences !== undefined,
      savedViews: body.saved_views !== undefined,
    },
    alertRules: body.alert_rules ?? [],
    exportedAt: body.exported_at,
    keywords: body.keywords ?? [],
    notificationPreferences: body.notification_preferences ?? [],
    projectId: body.project_id,
    savedViews: body.saved_views ?? [],
  };
}
const packageFields = new Set([
  "alert_rules",
  "competitors",
  "exported_at",
  "keywords",
  "notification_preferences",
  "project_id",
  "saved_views",
  "scope",
  "version",
]);

function normalizePackage(input: unknown) {
  const body = record(input);
  const normalized = normalizeSections(input);
  const normalizedBody = record(normalized);
  if (!body || !normalizedBody) return normalized;
  return {
    ...normalizedBody,
    __packageExtra: Object.keys(body).filter((key) => !packageFields.has(key)),
  };
}

const importKeywordsSchema = z.array(importKeywordSchema).max(IMPORT_PACKAGE_MAX_KEYWORDS);
const cloudImportBodyShape = {
  __bodyExtra: z.array(z.string()).max(0),
  __sections: z.object({
    alertRules: z.boolean().default(false),
    competitors: z.boolean().default(false),
    notificationPreferences: z.boolean().default(false),
    savedViews: z.boolean().default(false),
  }),
  alertRules: z.array(importAlertRuleSchema).max(500).default([]),
  competitors: z.array(competitorSchema).max(500).default([]),
  exportedAt: z.iso.datetime().optional(),
  keywords: importKeywordsSchema.default([]),
  notificationPreferences: z.array(notificationPreferenceSchema).max(50).default([]),
  projectId: strictPublicId("prj").optional(),
  savedViews: z.array(savedViewSchema).max(500).default([]),
  scope: z.enum(["current", "history"]).optional(),
  version: z.literal(5).optional(),
};

export const cloudImportBodySchema = z.preprocess(
  normalizeSections,
  z.looseObject(cloudImportBodyShape),
);
const packageSections = [
  "alertRules",
  "competitors",
  "notificationPreferences",
  "savedViews",
] as const;
export const cloudImportPackageSchema = z.preprocess(
  normalizePackage,
  z
    .looseObject({
      ...cloudImportBodyShape,
      __packageExtra: z.array(z.string()).max(0),
      projectId: strictPublicId("prj"),
      version: z.literal(5),
    })
    .superRefine((value, ctx) => {
      for (const section of packageSections) {
        if (!value.__sections[section]) {
          ctx.addIssue({
            code: "custom",
            message: `${section} section is required.`,
            path: [section],
          });
        }
      }
    }),
);

export type CloudImportBody = z.infer<typeof cloudImportBodySchema>;
export type ImportAlertRule = CloudImportBody["alertRules"][number];
export type ImportKeyword = CloudImportBody["keywords"][number];
export type ImportNotificationPreference = CloudImportBody["notificationPreferences"][number];
