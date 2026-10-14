"use server";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateRankCheckViews,
  revalidateSettingsPage,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import {
  createProjectSchema,
  normalizeTrackingScope,
  trackingScopeSchema,
} from "@/lib/schemas/project";
import { z } from "zod";
import { saveReviewedDefaultSettings, saveReviewedFrequencyDefaults } from "./defaults-reviewed";

const idSchema = z.string().trim().min(1).max(120);
const projectDetailsSchema = createProjectSchema.pick({ name: true }).extend({
  projectId: idSchema,
});
const runProjectCheckSchema = z.object({ projectId: idSchema });
const projectTrackingScopeSchema = z.object({
  projectId: idSchema,
  trackingScope: trackingScopeSchema,
});
type ManualCheckKeyword = { publicId: string };
type ManualCheckResult = {
  failed: number;
  queued: number;
  reason?: "budget_exhausted" | "budget_missing" | "usage_reconciliation_required";
  total: number;
};
const MANUAL_CHECK_CONCURRENCY = 4;
function manualCheckStarted(result: unknown) {
  if (!result || typeof result !== "object" || !("status" in result)) return false;
  return result.status === "running" || result.status === "completed";
}
async function runManualChecks(
  keywords: ManualCheckKeyword[],
  runCheck: (input: { keywordId: string }) => Promise<unknown>,
): Promise<ManualCheckResult> {
  let nextIndex = 0;
  let budgetReason: ManualCheckResult["reason"];
  let failed = 0;
  let queued = 0;
  const workerCount = Math.min(MANUAL_CHECK_CONCURRENCY, keywords.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!budgetReason && nextIndex < keywords.length) {
        const keyword = keywords[nextIndex];
        nextIndex += 1;
        if (!keyword) continue;
        try {
          const result = await runCheck({ keywordId: keyword.publicId });
          if (isBudgetExhaustedResult(result)) {
            if (!budgetReason || result.code === "budget_missing") budgetReason = result.code;
            continue;
          }
          if (!manualCheckStarted(result)) {
            failed += 1;
            continue;
          }
          queued += 1;
        } catch {
          failed += 1;
          // Keep the project-level manual run moving when one keyword fails.
        }
      }
    }),
  );
  if (budgetReason) {
    return {
      failed: keywords.length - queued,
      queued,
      reason: budgetReason,
      total: keywords.length,
    };
  }
  return { failed, queued, total: keywords.length };
}
export async function updateProjectDetails(input: unknown) {
  const data = parseActionInput(projectDetailsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const before = await prisma.project.findUnique({
    select: { domain: true, name: true, publicId: true, trackingScope: true },
    where: { id: project.id },
  });
  if (!before) {
    throw new Error("Project not found.");
  }
  const updated = await prisma.project.update({
    data: { name: data.name },
    select: { domain: true, name: true, publicId: true, trackingScope: true },
    where: { id: project.id },
  });
  await writeAudit({
    action: "settings.project_details.update",
    actorId: actor.id,
    after: updated,
    before,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateSettingsViews();
  return {
    domain: updated.domain,
    name: updated.name,
    projectId: updated.publicId,
    trackingScope: normalizeTrackingScope(updated.trackingScope),
  };
}
export async function updateProjectTrackingScope(input: unknown) {
  const data = parseActionInput(projectTrackingScopeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "project" });
  const before = await prisma.project.findUnique({
    select: { publicId: true, trackingScope: true },
    where: { id: project.id },
  });
  if (!before) {
    throw new Error("Project not found.");
  }
  const updated = await prisma.project.update({
    data: { trackingScope: data.trackingScope },
    select: { publicId: true, trackingScope: true },
    where: { id: project.id },
  });
  await writeAudit({
    action: "settings.project_tracking_scope.update",
    actorId: actor.id,
    after: updated,
    before,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateSettingsViews();
  return {
    projectId: updated.publicId,
    trackingScope: normalizeTrackingScope(updated.trackingScope),
  };
}
export async function updateDefaultRankCheckSettings(input: unknown, review?: unknown) {
  return saveReviewedDefaultSettings(input, review);
}
export async function updateRankCheckFrequency(input: unknown, review?: unknown) {
  return saveReviewedFrequencyDefaults(input, review);
}
export async function runManualProjectCheck(input: unknown) {
  const data = parseActionInput(runProjectCheckSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const keywords = await prisma.keyword.findMany({
    select: { publicId: true },
    where: { projectId: project.id },
  });
  // Defer the rank-check action so its server-only Temporal client stays out of
  // the module graph until a check is actually requested.
  const { runCheckNow } = await import("@/lib/actions/rankCheck");
  const result = await runManualChecks(keywords, runCheckNow);
  await writeAudit({
    action: "settings.run_check_now",
    actorId: actor.id,
    after: result,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateRankCheckViews();
  revalidateSettingsPage();
  return result;
}
