"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { createProject } from "@/lib/actions/project";
import { reconcileProjectMarkets } from "@/lib/actions/project-markets";
import { writeAudit } from "@/lib/auth/audit";
import { authorize } from "@/lib/auth/authorize";
import { MAX_PROJECT_MARKETS } from "@/lib/markets/limits";
import { type OnboardingWebsiteInput, onboardingWebsiteSchema } from "@/lib/onboarding/website";
import { websiteProjectIdentity } from "@/lib/onboarding/website.server";
import { canonicalKeySchema } from "@/lib/schemas/keyword";
import { locationLanguage, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { normalizeProjectTimezone } from "@/lib/settings/timezones";
import { z } from "zod";

const matchingScopeSchema = z.object({
  includeSubdomains: z.coerce.boolean(),
  projectId: z.string().trim().min(1).max(120),
  rootAndWww: z.coerce.boolean(),
  urlPrefix: z.coerce.boolean(),
});

const onboardingMarketsSchema = z.object({
  marketKeys: z.array(canonicalKeySchema).min(1).max(MAX_PROJECT_MARKETS),
  projectId: z.string().trim().min(1).max(120),
});

// The public website schema stays unchanged; the timezone is UI-action plumbing
// only and is normalized server-side before it reaches createProject.
const createOnboardingProjectSchema = onboardingWebsiteSchema.extend({
  timezone: z.unknown().optional(),
});

export async function deriveOnboardingWebsite(input: OnboardingWebsiteInput) {
  const data = parseActionInput(onboardingWebsiteSchema, input);
  const actor = await getActionActor();
  authorize(actor, "create", { ownerId: actor.id, requiredRole: "member", type: "project" });
  return websiteProjectIdentity(data.website);
}

export async function createOnboardingProject(input: unknown) {
  const data = parseActionInput(createOnboardingProjectSchema, input);
  const timezone = normalizeProjectTimezone(data.timezone);
  const identity = websiteProjectIdentity(data.website);
  const project = await createProject({
    ...identity,
    defaults: { frequency: "daily", timezone },
  });
  return { ...project, timezone };
}

/** Stores the location-language pairs selected in onboarding's MarketPicker. */
export async function saveOnboardingMarkets(input: unknown) {
  const data = parseActionInput(onboardingMarketsSchema, input);
  const marketKeys = [...new Set(data.marketKeys)];
  const choices = marketKeys.map((canonicalKey) => {
    const { selector } = normalizeCanonicalLocationKey(canonicalKey);
    return {
      canonicalKey,
      countryCode: selector.countryCode,
      kind: selector.cityName
        ? ("city" as const)
        : selector.regionName
          ? ("region" as const)
          : ("country" as const),
      languageCode: locationLanguage(selector.countryCode, selector.languageCode).code,
    };
  });
  await reconcileProjectMarkets({ choices, projectId: data.projectId });
  return { marketKeys };
}

/**
 * Matching scope has no project column yet, so its audit entry is the durable record.
 */
export async function saveMatchingScope(input: unknown) {
  const data = parseActionInput(matchingScopeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const scope = {
    includeSubdomains: data.includeSubdomains,
    rootAndWww: data.rootAndWww,
    urlPrefix: data.urlPrefix,
  };

  await writeAudit({
    action: "onboarding.matching_scope.set",
    actorId: actor.id,
    after: scope,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateSettingsViews();

  return { projectId: project.publicId, scope };
}
