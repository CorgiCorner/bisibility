"use server";

import { getActionActor, parseActionInput, requireProjectScope } from "@/lib/actions/_shared";
import { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import { joinWaitlist } from "@/lib/actions/waitlist";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { requireSession } from "@/lib/auth/session";
import { deploymentMode } from "@/lib/deployment/deployment";
import { getPricingFeedbackRow } from "@/lib/queries/waitlist";
import { hostedPricingFeedbackSchema } from "@/lib/schemas/usage-settings";

export async function submitHostedPricingFeedback(input: unknown) {
  const data = parseActionInput(hostedPricingFeedbackSchema, input);
  const [actor, session] = await Promise.all([getActionActor(), requireSession()]);
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "billing",
  });

  if (deploymentMode() !== "cloud") {
    throw new Error("Hosted pricing feedback is unavailable on self-hosted installs.");
  }

  // Recheck locally through a plain query rather than a shared "use server"
  // helper: exporting that lookup would expose an unauthenticated
  // email-existence oracle. Answered when the row was captured as settings
  // feedback or when the feedback timestamp is set (the OR covers legacy rows
  // whose source predates hostedPriceAnsweredAt).
  const existing = await getPricingFeedbackRow(session.user.email);
  const alreadyAnswered =
    existing?.source === "settings_feedback" || existing?.hostedPriceAnsweredAt != null;
  if (alreadyAnswered) {
    return { answered: true as const };
  }

  const result = await joinWaitlist({
    cloudPrice: "custom",
    cloudPriceCustom: data.monthlyPrice,
    email: session.user.email,
    source: "settings_feedback",
  });
  if (!result.ok) {
    return result;
  }
  await writeAudit({
    action: "settings.hosted_pricing_feedback.submit",
    actorId: actor.id,
    after: { answered: true, category: "custom" },
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });

  return { answered: true as const };
}

export const updateProviderAllocation = updateProviderConnectionAllocationAction;
