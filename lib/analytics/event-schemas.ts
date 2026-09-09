import {
  ANALYTICS_CONTROL_IDS,
  type AnalyticsControlId,
  type AnalyticsControlModule,
} from "@/lib/analytics/controls";
import { WINDOW_PRESETS } from "@/lib/search-insights/constants";
import { z } from "zod";

export const FORBIDDEN_PROPERTY_KEYS = [
  "api_key",
  "credentials",
  "domain",
  "email",
  "hostname",
  "keyword",
  "keywords",
  "login",
  "password",
  "website",
] as const;

const empty = z.object({});
const provider = z.enum(["dataforseo", "ga4", "gsc", "local-sequence", "plausible", "serpapi"]);
const surface = z.enum(["getting_started", "onboarding", "settings"]);
const setupStep = z.enum(["add_keywords", "connect_source", "create_project", "first_check"]);
const frequency = z.enum(["custom_cron", "daily", "manual", "monthly", "paused", "weekly"]);

export type UiOptionSelectedProps = {
  control: AnalyticsControlId;
  module: AnalyticsControlModule;
  value: boolean | number | string | string[];
};

const uiOptionSelectedSchema: z.ZodType<UiOptionSelectedProps> = z
  .object({
    control: z.enum(ANALYTICS_CONTROL_IDS),
    module: z.enum(["getting_started", "onboarding"]),
    value: z.union([
      z.boolean(),
      z.number().finite(),
      z.string().max(120),
      z.array(z.string().max(120)).max(20),
    ]),
  })
  .superRefine(({ control, module }, ctx) => {
    if (control.startsWith(`${module}.`)) return;
    ctx.addIssue({ code: "custom", message: "Analytics control and module must match." });
  });

export const analyticsEventSchemas = {
  $pageview: z.object({ $current_url: z.string().url() }),
  consent_updated: z.object({
    analytics: z.boolean(),
    replay: z.boolean(),
    version: z.number().int().positive(),
  }),
  getting_started_cta_clicked: z.object({
    card: z.enum(["ai", "github", "team"]).optional(),
    cta: z.enum(["accelerate", "go_further", "primary"]),
    step: setupStep,
  }),
  keywords_added: z.object({
    keyword_count: z.number().int().nonnegative(),
    market_count: z.number().int().nonnegative(),
    source: z.enum(["manual", "search_console"]),
    surface,
  }),
  landing_cost_estimate_opened: empty,
  landing_cta_submitted: z.object({ has_website: z.boolean() }),
  landing_hero_viewed: z.object({
    experiment: z.literal("landing-hero-actions"),
    "$feature/landing-hero-actions": z.enum(["control", "dual_cta"]),
  }),
  onboarding_entered: empty,
  onboarding_completed: z.object({
    first_check_ran: z.boolean(),
    has_provider: z.boolean(),
    keyword_count: z.number().int().nonnegative(),
  }),
  onboarding_project_created: z.object({ frequency }),
  onboarding_step_skipped: z.object({
    reason: z
      .enum(["cost_unclear", "just_exploring", "later", "no_provider_account"])
      .nullable()
      .optional(),
    step: setupStep,
  }),
  provider_connected: z.object({ provider, surface }),
  provider_connection_tested: z.object({
    error_category: z
      .enum(["authentication", "configuration", "network", "quota", "rate_limit", "unknown"])
      .nullable(),
    ok: z.boolean(),
    provider,
  }),
  rank_check_preview_completed: z.object({
    duration_ms: z.number().int().nonnegative(),
    provider,
    status: z.enum(["completed", "failed", "queued"]),
    surface: z.enum(["getting_started", "onboarding"]),
  }),
  search_insights_chip_opened: z.object({ which: z.enum(["band", "overlap"]) }),
  search_insights_comparison_changed: z.object({ comparison: z.string().max(80) }),
  search_insights_csv_exported: z.object({ rows: z.number().int().nonnegative() }),
  search_insights_drawer_pivot: z.object({
    from: z.string().max(80),
    to: z.string().max(80),
  }),
  search_insights_module_viewed: empty,
  search_insights_period_changed: z.object({
    window: z.enum(WINDOW_PRESETS.map(({ id }) => id)),
  }),
  search_insights_track_clicked: z.object({ source: z.enum(["drawer", "row"]) }),
  setup_video_opened: z.object({ step: setupStep }),
  ui_option_selected: uiOptionSelectedSchema,
  user_signed_up: z.object({ method: z.enum(["github", "google", "otp"]) }),
} as const;

export type AnalyticsSchemaEvent = keyof typeof analyticsEventSchemas;

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      (FORBIDDEN_PROPERTY_KEYS as readonly string[]).includes(key.toLowerCase()) ||
      containsForbiddenKey(nested),
  );
}

function pruneForbiddenKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pruneForbiddenKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) => !(FORBIDDEN_PROPERTY_KEYS as readonly string[]).includes(key.toLowerCase()),
      )
      .map(([key, nested]) => [key, pruneForbiddenKeys(nested)]),
  );
}

export function validateEventProps(event: string, props: unknown): Record<string, unknown> {
  const schema = analyticsEventSchemas[event as AnalyticsSchemaEvent];
  const strict = process.env.NODE_ENV !== "production";
  if (containsForbiddenKey(props) && strict) {
    throw new Error(`Invalid analytics properties for ${event}.`);
  }
  const pruned = pruneForbiddenKeys(props ?? {}) as Record<string, unknown>;
  if (!schema) return pruned;
  const result = schema.safeParse(pruned);
  if (!result.success) {
    if (strict) throw new Error(`Invalid analytics properties for ${event}.`);
    return {};
  }
  if (strict && Object.keys(result.data).length !== Object.keys(pruned).length) {
    throw new Error(`Unknown analytics properties for ${event}.`);
  }
  return result.data;
}
