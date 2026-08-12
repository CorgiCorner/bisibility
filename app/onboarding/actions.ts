"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { createProject } from "@/lib/actions/project";
import { writeAudit } from "@/lib/auth/audit";
import { authorize } from "@/lib/auth/authorize";
import { type OnboardingWebsiteInput, onboardingWebsiteSchema } from "@/lib/onboarding/website";
import { websiteProjectIdentity } from "@/lib/onboarding/website.server";
import { z } from "zod";

const matchingScopeSchema = z.object({
  includeSubdomains: z.coerce.boolean(),
  projectId: z.string().trim().min(1).max(120),
  rootAndWww: z.coerce.boolean(),
  urlPrefix: z.coerce.boolean(),
});

export async function deriveOnboardingWebsite(input: OnboardingWebsiteInput) {
  const data = parseActionInput(onboardingWebsiteSchema, input);
  const actor = await getActionActor();
  authorize(actor, "create", { ownerId: actor.id, requiredRole: "member", type: "project" });
  return websiteProjectIdentity(data.website);
}

export async function createOnboardingProject(input: OnboardingWebsiteInput) {
  const data = parseActionInput(onboardingWebsiteSchema, input);
  return createProject(websiteProjectIdentity(data.website));
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
