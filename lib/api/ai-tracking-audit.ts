import "server-only";
import { type AuditClient, writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";

type AuditProject = { id: string; publicId: string };
async function event(
  actor: Actor,
  project: AuditProject,
  action: string,
  after: { resourceId?: string; consent?: boolean; count?: number },
  client?: AuditClient,
) {
  const input = {
    action,
    actorId: actor.id,
    projectId: project.id,
    targetType: "project",
    targetId: project.publicId,
    after,
  };
  if (client) await writeAudit(input, client);
  else await writeAudit(input);
}
export async function auditTrackingCatalog(
  actor: Actor,
  project: AuditProject,
  resource: "topics" | "prompts" | "schedules",
  method: string,
  input: unknown,
  result: { publicId: string },
  client?: AuditClient,
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
  await event(
    actor,
    project,
    `ai_tracking.${kind}.${operation}`,
    { resourceId: result.publicId },
    client,
  );
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

type EngineChoice = { enabled: boolean; engine: string; source: string };

function engineChoice(value: EngineChoice) {
  return { enabled: value.enabled, engine: value.engine, source: value.source };
}

export async function auditTrackingEngine(
  actor: Actor,
  project: AuditProject,
  after: EngineChoice,
  before: EngineChoice | null,
  client?: AuditClient,
) {
  const input = {
    action: after.enabled ? "ai_tracking.engine.enable" : "ai_tracking.engine.disable",
    actorId: actor.id,
    after: engineChoice(after),
    before: before ? engineChoice(before) : null,
    projectId: project.id,
    targetId: `${after.engine}:${after.source}`,
    targetType: "ai_project_engine",
  };
  if (client) await writeAudit(input, client);
  else await writeAudit(input);
}
