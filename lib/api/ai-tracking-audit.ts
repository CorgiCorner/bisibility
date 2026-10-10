import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";

type AuditProject = { id: string; publicId: string };
async function event(
  actor: Actor,
  project: AuditProject,
  action: string,
  after: { resourceId?: string; consent?: boolean; count?: number },
) {
  await writeAudit({
    action,
    actorId: actor.id,
    projectId: project.id,
    targetType: "project",
    targetId: project.publicId,
    after,
  });
}
export async function auditTrackingCatalog(
  actor: Actor,
  project: AuditProject,
  resource: "topics" | "prompts" | "schedules",
  method: string,
  input: unknown,
  result: { publicId: string },
) {
  const kind = { topics: "topic", prompts: "prompt", schedules: "schedule" }[resource];
  const values = input as { paused?: boolean; enabled?: boolean; consent?: boolean };
  const operation =
    method === "DELETE"
      ? "archive"
      : method === "POST"
        ? "create"
        : values.paused === undefined
          ? "update"
          : values.paused
            ? "pause"
            : "resume";
  await event(actor, project, `ai_tracking.${kind}.${operation}`, { resourceId: result.publicId });
  if (resource === "schedules" && method !== "DELETE") {
    if (values.enabled !== undefined)
      await event(actor, project, `ai_tracking.schedule.${values.enabled ? "enable" : "disable"}`, {
        resourceId: result.publicId,
      });
    if (values.enabled && values.consent === true)
      await event(actor, project, "ai_tracking.schedule.consent", {
        resourceId: result.publicId,
        consent: true,
      });
  }
}
export async function auditTrackingRun(
  actor: Actor,
  project: AuditProject,
  operation: "launch" | "cancel" | "retry",
  result: { publicId: string },
) {
  await event(actor, project, `ai_tracking.run.${operation}`, { resourceId: result.publicId });
  if (operation !== "cancel")
    await event(actor, project, "ai_tracking.run.consent", {
      resourceId: result.publicId,
      consent: true,
    });
}
export async function auditTrackingAcceptance(actor: Actor, project: AuditProject, count: number) {
  await event(actor, project, "ai_tracking.suggestions.accept", { count });
}
export async function auditTrackingGeneration(
  actor: Actor,
  project: AuditProject,
  generationId: string,
) {
  await event(actor, project, "ai_tracking.suggestions.generate", { resourceId: generationId });
  await event(actor, project, "ai_tracking.suggestions.consent", {
    resourceId: generationId,
    consent: true,
  });
}
