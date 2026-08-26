import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProviderCostFeature } from "@/lib/generated/prisma/client";
import {
  LEGACY_PROVIDER_INSTANCE_SLUG_SETTING_KEY,
  PROVIDER_INSTANCE_SLUG_SETTING_KEY,
  parseProviderInstanceSlug,
} from "@/lib/instance-setting-definitions";

const DEFAULT_INSTANCE_SLUG = "bisibility";
const INSTANCE_SLUG_CACHE_MS = 60_000;
const MAX_TAG_LENGTH = 255;
const MAX_INSTANCE_SLUG_LENGTH = 48;
const MAX_PROJECT_ID_LENGTH = 64;
const MIN_NON_KEY_VALUE_LENGTH = 1;

export const PROVIDER_REQUEST_SOURCES = ["app", "worker", "cli", "mcp", "sdk"] as const;
export type ProviderRequestSource = (typeof PROVIDER_REQUEST_SOURCES)[number];
export const PROVIDER_REQUEST_FEATURES = [
  "backlinks",
  "domain_overview",
  "keyword_metrics",
  "keyword_research",
  "rank_check",
  "ranked_keywords",
] as const satisfies readonly ProviderCostFeature[];
export const PROVIDER_REQUEST_TRIGGERS = ["manual", "scheduled"] as const;
export type ProviderRequestTrigger = (typeof PROVIDER_REQUEST_TRIGGERS)[number];

export type ProviderRequestContext = Readonly<{
  correlationId: string;
  feature: ProviderCostFeature;
  projectId: string;
  source: ProviderRequestSource;
  trigger: ProviderRequestTrigger;
}>;

export type ProviderRequestAttribution = Readonly<{
  context: ProviderRequestContext;
  tag: string;
}>;

type BuildProviderTagInput = {
  context: ProviderRequestContext;
  instanceSlug: string | null | undefined;
  stage?: string;
};

function sanitizedIdentifier(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`Provider request ${field} must be a string.`);
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error(`Provider request ${field} must not be empty.`);
  return normalized.slice(0, maxLength);
}

function correlationId(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Provider request correlationId must not be empty.");
  }
  if (!/^[a-zA-Z0-9._:-]+$/.test(value)) {
    throw new Error("Provider request correlationId contains unsupported characters.");
  }
  return value;
}

function byteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Provider request ${field} is invalid.`);
  }
  return value as T;
}

export function providerStage(value = process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "prod" || normalized === "production") return "prod";
  if (normalized === "stage" || normalized === "staging") return "stage";
  return "dev";
}

function normalizedContext(context: ProviderRequestContext): ProviderRequestContext {
  if (!context || typeof context !== "object") {
    throw new Error("Provider request context is required.");
  }
  const expectedKeys = ["correlationId", "feature", "projectId", "source", "trigger"];
  const actualKeys = Object.keys(context);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => !expectedKeys.includes(key))
  ) {
    throw new Error("Provider request context contains unknown or missing fields.");
  }
  return {
    correlationId: correlationId(context.correlationId),
    feature: oneOf(context.feature, "feature", PROVIDER_REQUEST_FEATURES),
    projectId: sanitizedIdentifier(context.projectId, "projectId", MAX_PROJECT_ID_LENGTH),
    source: oneOf(context.source, "source", PROVIDER_REQUEST_SOURCES),
    trigger: oneOf(context.trigger, "trigger", PROVIDER_REQUEST_TRIGGERS),
  };
}

export function buildProviderTag(input: BuildProviderTagInput) {
  const context = normalizedContext(input.context);
  const configuredSlug =
    typeof input.instanceSlug === "string" ? parseProviderInstanceSlug(input.instanceSlug) : null;
  let app = (configuredSlug ?? DEFAULT_INSTANCE_SLUG).slice(0, MAX_INSTANCE_SLUG_LENGTH);
  let projectId = context.projectId;
  const fixed = `app=;stage=${providerStage(input.stage)};src=${context.source};trg=${context.trigger};f=${context.feature};p=;c=${context.correlationId}`;
  let excess = byteLength(fixed) + byteLength(app) + byteLength(projectId) - MAX_TAG_LENGTH;
  if (excess > 0) {
    const projectReduction = Math.min(excess, projectId.length - MIN_NON_KEY_VALUE_LENGTH);
    projectId = projectId.slice(0, projectId.length - projectReduction);
    excess -= projectReduction;
  }
  if (excess > 0) {
    const appReduction = Math.min(excess, app.length - MIN_NON_KEY_VALUE_LENGTH);
    app = app.slice(0, app.length - appReduction);
    excess -= appReduction;
  }
  if (excess > 0) {
    throw new Error("Provider request correlationId is too long for the 255-byte provider tag.");
  }
  const tag = `app=${app};stage=${providerStage(input.stage)};src=${context.source};trg=${context.trigger};f=${context.feature};p=${projectId};c=${context.correlationId}`;
  if (byteLength(tag) > MAX_TAG_LENGTH) {
    throw new Error("Provider request tag exceeds 255 bytes.");
  }
  return tag;
}

export function resolveProviderInstanceSlug(settings: readonly { key: string; value: string }[]) {
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const canonical = values.get(PROVIDER_INSTANCE_SLUG_SETTING_KEY);
  const legacy = values.get(LEGACY_PROVIDER_INSTANCE_SLUG_SETTING_KEY);
  return (
    (canonical ? parseProviderInstanceSlug(canonical) : null) ??
    (legacy ? parseProviderInstanceSlug(legacy) : null) ??
    DEFAULT_INSTANCE_SLUG
  );
}

let cachedInstanceSlug: { expiresAt: number; value: string } | null = null;

async function providerInstanceSlug() {
  if (cachedInstanceSlug && cachedInstanceSlug.expiresAt > Date.now())
    return cachedInstanceSlug.value;
  let value = DEFAULT_INSTANCE_SLUG;
  try {
    const settings = await prisma.instanceSetting.findMany({
      select: { key: true, value: true },
      where: {
        key: {
          in: [PROVIDER_INSTANCE_SLUG_SETTING_KEY, LEGACY_PROVIDER_INSTANCE_SLUG_SETTING_KEY],
        },
      },
    });
    value = resolveProviderInstanceSlug(settings);
  } catch {
    // A neutral fallback retains attribution during a settings-store failure.
  }
  cachedInstanceSlug = { expiresAt: Date.now() + INSTANCE_SLUG_CACHE_MS, value };
  return value;
}

export async function createProviderRequestAttribution(
  context: ProviderRequestContext,
): Promise<ProviderRequestAttribution> {
  const normalized = normalizedContext(context);
  const instanceSlug = await providerInstanceSlug();
  return {
    context: normalized,
    tag: buildProviderTag({ context: normalized, instanceSlug, stage: process.env.DEPLOYMENT_ENV }),
  };
}
