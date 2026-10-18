"use server";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { getProjectDepthDecreaseWarning } from "@/lib/alerts/depth-conflict.server";
import { readConsentFromCookies, trackServerEvent } from "@/lib/analytics/server";
import { createProjectRecord } from "@/lib/api/project-service";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { createProjectSchema } from "@/lib/schemas/project";
import { serpDepthSchema } from "@/lib/schemas/serp-depth";
import { z } from "zod";
import { saveReviewedProjectDefaults } from "./defaults-reviewed";

const completeProjectOnboardingSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});

export async function createProject(input: unknown) {
  const data = parseActionInput(createProjectSchema, input);
  const actor = await getActionActor();
  authorize(actor, "create", { ownerId: actor.id, requiredRole: "member", type: "project" });
  const project = await createProjectRecord(data, actor.id);
  revalidateSettingsViews();

  return {
    domain: project.domain,
    id: project.publicId,
    name: project.name,
    publicId: project.publicId,
    trackingScope: project.trackingScope,
  };
}

export async function completeProjectOnboarding(input: unknown) {
  const data = parseActionInput(completeProjectOnboardingSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const result = await prisma.project.updateMany({
    data: { onboardingCompletedAt: new Date() },
    where: { id: project.id, onboardingCompletedAt: null },
  });

  if (result.count === 1) {
    const [providerCount, keywordCount, firstCheckCount] = await Promise.all([
      prisma.providerConnection.count({
        where: { enabled: true, kind: "serp", projectId: project.id, status: "connected" },
      }),
      prisma.keyword.count({ where: { projectId: project.id } }),
      prisma.rankCheckRun.count({ where: { projectId: project.id } }),
    ]);
    await trackServerEvent("onboarding_completed", {
      consent: await readConsentFromCookies(),
      userId: actor.id,
      properties: {
        first_check_ran: firstCheckCount > 0,
        has_provider: providerCount > 0,
        keyword_count: keywordCount,
      },
    });
  }

  return { completed: result.count === 1 };
}

export async function updateProjectDefaults(input: unknown, review?: unknown) {
  const result = await saveReviewedProjectDefaults(input, review);
  if (result.kind !== "saved") return result;
  const project = await prisma.project.findUniqueOrThrow({
    where: { publicId: result.projectId },
    select: { id: true },
  });
  const warning = await getProjectDepthDecreaseWarning(
    project.id,
    serpDepthSchema.parse(result.serpDepth),
  );
  return { ...result, warning };
}
