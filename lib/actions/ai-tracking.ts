"use server";
import { trackingSampleProjection } from "@/lib/ai-tracking/projections/evidence";
import { trackingPromptOperationProjection } from "@/lib/ai-tracking/projections/operations";
import {
  publicTrackingRevision,
  publicTrackingSchedule,
} from "@/lib/ai-tracking/projections/public";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { getTrackingPromptOperations } from "@/lib/ai-tracking/queries/prompt-operations";
import { auditTrackingCatalog, auditTrackingRun } from "@/lib/api/ai-tracking-audit";
import {
  mutateTrackingCatalog,
  trackingCatalog,
  trackingLaunch,
  trackingRunOperation,
  trackingRuns,
  trackingSamples,
  trackingScope,
} from "@/lib/api/ai-tracking-service";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { revalidatePath } from "next/cache";
import { getActionActor } from "./_shared";

export async function getAiTrackingPage(projectId: string): Promise<TrackingWorkspaceData> {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId);
  const [topics, prompts, schedules, runs] = await Promise.all([
    trackingCatalog(project.id, "topics"),
    trackingCatalog(project.id, "prompts"),
    trackingCatalog(project.id, "schedules"),
    trackingRuns(project.id, { limit: 20 }),
  ]);
  const operationBatches = [];
  for (let offset = 0; offset < prompts.length; offset += 100)
    operationBatches.push(
      getTrackingPromptOperations(
        project.id,
        prompts.slice(offset, offset + 100).map((prompt) => prompt.id),
      ),
    );
  const operations: Awaited<ReturnType<typeof getTrackingPromptOperations>> = Object.assign(
    {},
    ...(await Promise.all(operationBatches)),
  );
  return {
    domain: project.domain ?? "",
    canWrite:
      canProjectAction(getProjectRole(actor, project.id), "update", "project") &&
      !isProjectReadOnly(project.writeMode),
    topics: topics.map((topic) => ({
      id: topic.publicId,
      name: topic.name,
      description: topic.description,
      status: topic.archivedAt ? "archived" : topic.pausedAt ? "paused" : "active",
    })),
    prompts: prompts.map((prompt) => ({
      ...trackingPromptOperationProjection(operations[prompt.id]),
      id: prompt.publicId,
      text: prompt.revisions[0]?.text ?? "",
      label: prompt.label,
      topicId: topics.find((topic) => topic.id === prompt.topicId)?.publicId ?? null,
      topicName: topics.find((topic) => topic.id === prompt.topicId)?.name ?? "Unassigned",
      revisionId: prompt.revisions[0]?.publicId ?? "",
      revision: prompt.revisions[0]?.ordinal ?? 1,
      category: prompt.revisions[0]?.category ?? "neutral",
      sourceProvenance: prompt.revisions[0]
        ? publicTrackingRevision(prompt.revisions[0]).generationReference
          ? "model_generated_hypothesis"
          : publicTrackingRevision(prompt.revisions[0]).providerDatasetReference
            ? "provider_dataset"
            : "manual"
        : "manual",
      status: prompt.archivedAt
        ? "archived"
        : prompt.pausedAt ||
            topics.find((topic) => topic.id === prompt.topicId)?.pausedAt ||
            topics.find((topic) => topic.id === prompt.topicId)?.archivedAt
          ? "paused"
          : "active",
    })),
    schedules: schedules
      .filter((schedule) => !schedule.archivedAt)
      .map((schedule) => {
        const value = publicTrackingSchedule(schedule, prompts);
        return {
          id: value.id,
          name: value.name,
          cron: value.cron,
          timezone: value.timezone,
          enabled: value.enabled,
          promptIds: value.configuration.promptIds.filter((id): id is string => Boolean(id)),
          configurations: value.configuration.configurations,
          nextRunAt: value.nextRunAt?.toISOString() ?? null,
        };
      }),
    runsNextCursor: runs.nextCursor,
    runs: runs.items.map((run) => ({
      id: run.publicId,
      state: run.state,
      createdAt: run.createdAt.toISOString(),
      sampleCount: run._count?.samples ?? 0,
    })),
  };
}
export async function mutateAiTrackingAction(
  projectId: string,
  resource: "topics" | "prompts" | "schedules",
  method: "POST" | "PATCH" | "DELETE",
  input: unknown,
  member?: string,
) {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId, true);
  const value =
    resource === "schedules" && (input as { configuration?: unknown }).configuration
      ? {
          ...(input as object),
          configuration: {
            ...(input as { configuration: object }).configuration,
            actorId: actor.id,
            actorCredential: undefined,
            entrySource: "app",
            origin: "manual",
          },
        }
      : input;
  const result = await mutateTrackingCatalog(project.id, resource, method, value, member);
  await auditTrackingCatalog(actor, project, resource, method, value, result);
  revalidatePath(`/app/${projectId}/ai-tracking`);
  return getAiTrackingPage(projectId);
}
export async function previewAiTrackingAction(projectId: string, input: unknown) {
  const project = await trackingScope(await getActionActor(), projectId);
  return trackingLaunch(project.id, input, true);
}
export async function launchAiTrackingAction(projectId: string, input: unknown) {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId, true);
  const result = await trackingLaunch(
    project.id,
    {
      ...(input as object),
      actorId: actor.id,
      actorCredential: undefined,
      entrySource: "app",
      origin: "manual",
    },
    false,
  );
  await auditTrackingRun(actor, project, "launch", result);
  revalidatePath(`/app/${projectId}/ai-tracking`);
  return result;
}
export async function getAiTrackingSamplesAction(
  projectId: string,
  runId: string,
  cursor?: string,
) {
  const project = await trackingScope(await getActionActor(), projectId);
  const page = await trackingSamples(project.id, runId, { cursor, limit: 50 });
  return { items: page.items.map(trackingSampleProjection), nextCursor: page.nextCursor };
}
export async function getAiTrackingRunsAction(projectId: string, cursor?: string) {
  const project = await trackingScope(await getActionActor(), projectId);
  const page = await trackingRuns(project.id, { cursor, limit: 20 });
  return {
    items: page.items.map((run) => ({
      id: run.publicId,
      state: run.state,
      createdAt: run.createdAt.toISOString(),
      sampleCount: run._count.samples,
    })),
    nextCursor: page.nextCursor,
  };
}
export async function aiTrackingRunAction(
  projectId: string,
  runId: string,
  operation: "cancel" | "retry",
  input: unknown = {},
) {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId, true);
  const result = await trackingRunOperation(project.id, runId, operation, {
    ...(input as object),
    actorId: actor.id,
    actorCredential: undefined,
    entrySource: "app",
    origin: "manual",
  });
  await auditTrackingRun(actor, project, operation, result);
  revalidatePath(`/app/${projectId}/ai-tracking`);
  return result;
}

export async function getAiTrackingTrendsAction(
  projectId: string,
  runId: string,
  previousRunId?: string,
) {
  const project = await trackingScope(await getActionActor(), projectId);
  const { trackingTrends } = await import("@/lib/api/ai-tracking-trends");
  return trackingTrends(project.id, runId, previousRunId);
}
export async function exportAiTrackingEvidenceAction(
  projectId: string,
  runId: string,
  format: "json" | "csv",
  cursor?: string,
) {
  const project = await trackingScope(await getActionActor(), projectId);
  const page = await trackingSamples(project.id, runId, { cursor, limit: 100 });
  const { trackingCsv } = await import("@/lib/ai-tracking/exports/csv");
  const { trackingExportProjection } = await import("@/lib/ai-tracking/projections/evidence");
  return {
    content:
      format === "csv"
        ? trackingCsv(
            page.items.map((sample) => ({ ...trackingExportProjection(sample, runId), runId })),
          )
        : JSON.stringify(
            { runId, items: page.items.map(trackingSampleProjection), nextCursor: page.nextCursor },
            null,
            2,
          ),
    nextCursor: page.nextCursor,
  };
}
export async function suggestAiTrackingPromptsAction(projectId: string) {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId);
  const { projectContextSuggestions } = await import("@/lib/ai-tracking/suggestions/project");
  return projectContextSuggestions(actor, project);
}
