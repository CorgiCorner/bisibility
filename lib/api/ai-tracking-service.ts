import "server-only";
import { requireProjectScope } from "@/lib/actions/_shared";
import {
  approveTrackingConfiguration,
  launchTrackingRun,
  previewTrackingRun,
} from "@/lib/ai-tracking/admission/launch";
import type { PlanTrackingRunInput } from "@/lib/ai-tracking/contract";
import {
  trackingPageSchema,
  trackingPromptForm,
  trackingTopicForm,
} from "@/lib/ai-tracking/projections/forms";
import { resolveTrackingConnection } from "@/lib/ai-tracking/queries/connections";
import { listTrackingRuns } from "@/lib/ai-tracking/queries/runs";
import { listTrackingSamples } from "@/lib/ai-tracking/queries/samples";
import {
  planTrackingRunSchema,
  scheduleInputSchema,
  sourceConfigurationSchema,
} from "@/lib/ai-tracking/schema";
import {
  archivePrompt,
  createPrompt,
  listPromptRevisions,
  listPrompts,
  updatePrompt,
} from "@/lib/ai-tracking/stores/prompts";
import { cancelTrackingRun, getTrackingRun } from "@/lib/ai-tracking/stores/runs";
import {
  archiveSchedule,
  createSchedule,
  listSchedules,
  updateSchedule,
} from "@/lib/ai-tracking/stores/schedules";
import {
  archiveTopic,
  createTopic,
  listTopics,
  updateTopic,
} from "@/lib/ai-tracking/stores/topics";
import type { Actor } from "@/lib/auth/authorize";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";

export async function trackingScope(actor: Actor, project: string, write = false) {
  return requireProjectScope(actor, write ? "update" : "read", project, { type: "project" });
}
export async function resolveTrackingId(
  projectId: string,
  resource: "topics" | "prompts" | "schedules",
  publicId: string,
) {
  const rows = await { topics: listTopics, prompts: listPrompts, schedules: listSchedules }[
    resource
  ](projectId);
  const row = rows.find((item) => item.publicId === publicId);
  if (!row) throw new Error(`${resource} not found.`);
  return row.id;
}
export function trackingCatalog(
  projectId: string,
  resource: "topics",
): ReturnType<typeof listTopics>;
export function trackingCatalog(
  projectId: string,
  resource: "prompts",
): ReturnType<typeof listPrompts>;
export function trackingCatalog(
  projectId: string,
  resource: "schedules",
): ReturnType<typeof listSchedules>;
export function trackingCatalog(projectId: string, resource: string): Promise<unknown[]>;
export async function trackingCatalog(projectId: string, resource: string) {
  switch (resource) {
    case "topics":
      return listTopics(projectId);
    case "prompts":
      return listPrompts(projectId);
    case "schedules":
      return listSchedules(projectId);
    default:
      throw new Error("Tracking resource not found.");
  }
}
export async function mutateTrackingCatalog(
  projectId: string,
  resource: string,
  method: string,
  value: unknown,
  publicId?: string,
) {
  if (resource === "topics") {
    const id = publicId ? await resolveTrackingId(projectId, "topics", publicId) : null;
    if (id && method === "DELETE") return archiveTopic(projectId, id);
    const input = (id ? trackingTopicForm.partial() : trackingTopicForm).parse(value);
    return id
      ? updateTopic(projectId, id, input)
      : createTopic(projectId, trackingTopicForm.parse(value));
  }
  if (resource === "prompts") {
    const id = publicId ? await resolveTrackingId(projectId, "prompts", publicId) : null;
    if (id && method === "DELETE") return archivePrompt(projectId, id);
    const input = (id ? trackingPromptForm.partial() : trackingPromptForm).parse(value);
    const topicId =
      input.topicId === undefined
        ? undefined
        : input.topicId
          ? await resolveTrackingId(projectId, "topics", input.topicId)
          : null;
    return id
      ? updatePrompt(projectId, id, { ...input, topicId })
      : createPrompt(projectId, { ...trackingPromptForm.parse(value), topicId });
  }
  if (resource === "schedules") {
    const id = publicId ? await resolveTrackingId(projectId, "schedules", publicId) : null;
    if (id && method === "DELETE") return archiveSchedule(projectId, id);
    const input = (id ? scheduleInputSchema.partial() : scheduleInputSchema).parse(value);
    const saved = id
      ? (await listSchedules(projectId)).find(
          (schedule) => schedule.id === id && !schedule.archivedAt,
        )
      : null;
    if (id && !saved) throw new Error("Schedule not found.");
    if (id && !input.configuration) {
      if (input.enabled && !saved?.enabled)
        throw new Error("Enabling requires reviewed configuration and explicit budget consent.");
      return updateSchedule(projectId, id, input);
    }
    const configuration = await trackingPlan(projectId, input.configuration);
    if (input.enabled ?? saved?.enabled ?? false)
      await approveTrackingConfiguration(projectId, {
        ...configuration,
        consent: (value as { consent?: boolean }).consent === true,
      });
    return id
      ? updateSchedule(projectId, id, { ...input, configuration })
      : createSchedule(projectId, { ...scheduleInputSchema.parse(value), configuration });
  }
  throw new Error("Tracking resource not found.");
}
export async function trackingPlan(
  projectId: string,
  value: unknown,
): Promise<PlanTrackingRunInput> {
  const input = planTrackingRunSchema.parse(value);
  const promptIds = await Promise.all(
    input.promptIds.map((id: string) => resolveTrackingId(projectId, "prompts", id)),
  );
  const scheduleId = input.scheduleId
    ? await resolveTrackingId(projectId, "schedules", input.scheduleId)
    : undefined;
  const connection = await resolveTrackingConnection(projectId, input.credentialConnectionId);
  if (!connection) throw new Error("Provider connection not found.");
  return { ...input, promptIds, scheduleId, credentialConnectionId: connection.id };
}
export async function trackingRuns(projectId: string, page: unknown) {
  return listTrackingRuns(projectId, trackingPageSchema.parse(page));
}
export async function trackingRun(projectId: string, publicId: string) {
  if (!isPublicIdOfType(publicId, "air")) throw new Error("Run not found.");
  const run = await getTrackingRun(projectId, publicId);
  if (!run) throw new Error("Run not found.");
  return run;
}
export async function trackingRunOperation(
  projectId: string,
  publicId: string,
  operation: string,
  value: unknown,
) {
  const run = await trackingRun(projectId, publicId);
  if (operation === "cancel") return cancelTrackingRun(projectId, run.id);
  if (operation === "retry") {
    const input = await trackingPlan(projectId, value);
    if ((value as { consent?: boolean }).consent !== true)
      throw new Error("Explicit budget consent is required.");
    if (run.samples.some((sample) => sample.dispatch !== "terminal"))
      throw new Error("Unresolved samples require reconciliation before retry.");
    return launchTrackingRun(projectId, { ...input, retryOfRunId: run.id, consent: true });
  }
  throw new Error("Run operation not found.");
}
export async function trackingSamples(projectId: string, publicId: string, page: unknown) {
  const run = await trackingRun(projectId, publicId);
  return listTrackingSamples(projectId, run.id, trackingPageSchema.parse(page));
}
export function trackingLaunch(
  projectId: string,
  value: unknown,
  preview: true,
): Promise<Omit<Awaited<ReturnType<typeof previewTrackingRun>>, "credentialConnectionPublicId">>;
export function trackingLaunch(
  projectId: string,
  value: unknown,
  preview: false,
): ReturnType<typeof launchTrackingRun>;
export async function trackingLaunch(projectId: string, value: unknown, preview: boolean) {
  if (preview) {
    const input = trackingPreviewSchema.parse(value);
    const promptIds = await Promise.all(
      input.promptIds.map((id) => resolveTrackingId(projectId, "prompts", id)),
    );
    const connection = input.credentialConnectionId
      ? await resolveTrackingConnection(projectId, input.credentialConnectionId)
      : null;
    if (input.credentialConnectionId && !connection)
      throw new Error("Provider connection not found.");
    const preview = await previewTrackingRun(projectId, {
      ...input,
      promptIds,
      credentialConnectionId: connection?.id,
    });
    const { credentialConnectionPublicId, ...result } = preview;
    return { ...result, credentialConnectionId: credentialConnectionPublicId };
  }
  const input = await trackingPlan(projectId, value);
  return launchTrackingRun(projectId, {
    ...input,
    consent: (value as { consent?: boolean }).consent === true,
  });
}
export async function trackingRevisions(projectId: string, publicId: string) {
  return listPromptRevisions(projectId, await resolveTrackingId(projectId, "prompts", publicId));
}

export const trackingPreviewSchema = z.object({
  promptIds: z.array(z.string().min(1)).min(1).max(100),
  configurations: z.array(sourceConfigurationSchema).min(1).max(20),
  credentialConnectionId: z.string().optional(),
});
