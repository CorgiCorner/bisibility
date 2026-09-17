"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateProviderViews,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { updateUnmeasuredProject } from "@/lib/onboarding/update-project";
import { onboardingWebsiteSchema } from "@/lib/onboarding/website";
import { websiteProjectIdentity } from "@/lib/onboarding/website.server";
import {
  cancelPendingGoogleOAuth,
  getPendingGoogleOAuthProvider,
} from "@/lib/providers/analytics/google-oauth-pending";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = onboardingWebsiteSchema.extend({ projectId: z.string().trim().min(1).max(120) });

export async function updateOnboardingProject(input: unknown) {
  const data = parseActionInput(schema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const result = await updateUnmeasuredProject({
    actorId: actor.id,
    projectId: project.id,
    identity: websiteProjectIdentity(data.website),
  });
  if (result.ok && result.changed) {
    if ((await getPendingGoogleOAuthProvider(project.publicId)) === "gsc") {
      await cancelPendingGoogleOAuth(project.publicId);
    }
    revalidateProviderViews();
    revalidateSettingsViews();
    revalidatePath("/onboarding");
  }
  return result;
}
