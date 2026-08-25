import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProviderCostFeature } from "@/lib/generated/prisma/client";
import {
  PROVIDER_INSTANCE_SLUG_SETTING_KEY,
  parseProviderInstanceSlug,
} from "@/lib/instance-setting-definitions";

const DEFAULT_INSTANCE_SLUG = "bisibility";
const INSTANCE_SLUG_CACHE_MS = 60_000;
const MAX_TAG_LENGTH = 255;

export const PROVIDER_USAGE_SOURCES = ["app", "worker", "cli", "mcp", "sdk"] as const;
export type ProviderUsageSource = (typeof PROVIDER_USAGE_SOURCES)[number];
export const PROVIDER_USAGE_TRIGGERS = ["manual", "scheduled"] as const;
export type ProviderUsageTrigger = (typeof PROVIDER_USAGE_TRIGGERS)[number];

export type ProviderUsage = {
  correlationId: string;
  source: ProviderUsageSource;
  tag: string;
  trigger: ProviderUsageTrigger;
};

type BuildProviderTagInput = {
  app: string;
  correlationId: string;
  feature: ProviderCostFeature;
  projectId: string;
  source: ProviderUsageSource;
  stage: string | undefined;
  trigger: ProviderUsageTrigger;
};

function tagValue(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "").slice(0, 96) || fallback;
}

export function providerStage(value = process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "prod" || normalized === "production") return "prod";
  if (normalized === "stage" || normalized === "staging") return "stage";
  return "dev";
}

export function buildProviderTag(input: BuildProviderTagInput) {
  return [
    `app=${tagValue(input.app, DEFAULT_INSTANCE_SLUG)}`,
    `stage=${providerStage(input.stage)}`,
    `src=${tagValue(input.source, "app")}`,
    `trg=${tagValue(input.trigger, "manual")}`,
    `f=${tagValue(input.feature, "unknown")}`,
    `p=${tagValue(input.projectId, "unknown")}`,
    `c=${tagValue(input.correlationId, "unknown")}`,
  ]
    .join(";")
    .slice(0, MAX_TAG_LENGTH);
}

let cachedInstanceSlug: { expiresAt: number; value: string } | null = null;

async function providerInstanceSlug() {
  if (cachedInstanceSlug && cachedInstanceSlug.expiresAt > Date.now()) {
    return cachedInstanceSlug.value;
  }
  let value = DEFAULT_INSTANCE_SLUG;
  try {
    const setting = await prisma.instanceSetting.findUnique({
      select: { value: true },
      where: { key: PROVIDER_INSTANCE_SLUG_SETTING_KEY },
    });
    const configured = setting ? parseProviderInstanceSlug(setting.value) : null;
    if (configured) value = configured;
  } catch {
    // Falling back retains attribution during a transient settings-store failure.
  }
  cachedInstanceSlug = { expiresAt: Date.now() + INSTANCE_SLUG_CACHE_MS, value };
  return value;
}

export async function createProviderUsage(input: {
  correlationId: string;
  feature: ProviderCostFeature;
  projectId: string;
  source: ProviderUsageSource;
  trigger: ProviderUsageTrigger;
}): Promise<ProviderUsage> {
  const app = await providerInstanceSlug();
  return {
    correlationId: input.correlationId,
    source: input.source,
    tag: buildProviderTag({ ...input, app, stage: process.env.DEPLOYMENT_ENV }),
    trigger: input.trigger,
  };
}
