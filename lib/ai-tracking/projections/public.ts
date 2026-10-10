import type { PlanTrackingRunInput } from "@/lib/ai-tracking/contract";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import type {
  AiPrompt,
  AiPromptRevision,
  AiTopic,
  AiTrackingRun,
  AiTrackingSchedule,
} from "@/lib/generated/prisma/client";
export function publicTrackingTopic(topic: AiTopic) {
  return {
    id: topic.publicId,
    name: topic.name,
    description: topic.description,
    archivedAt: topic.archivedAt,
    pausedAt: topic.pausedAt,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}
export function publicTrackingRevision(revision: AiPromptRevision) {
  const source = revision.provenance as Record<string, unknown> | null;
  const generationReference =
    source?.method === "model_generated_hypothesis" &&
    typeof source.generationId === "string" &&
    isPublicIdOfType(source.generationId, "asg") &&
    typeof source.draftId === "string"
      ? { generationId: source.generationId, draftId: source.draftId }
      : undefined;
  const providerDatasetReference =
    source?.method === "provider_dataset" &&
    typeof source.reportId === "string" &&
    isPublicIdOfType(source.reportId, "agr") &&
    typeof source.rowIndex === "number"
      ? { reportId: source.reportId, rowIndex: source.rowIndex }
      : undefined;
  return {
    id: revision.publicId,
    ordinal: revision.ordinal,
    category: revision.category,
    generationReference,
    providerDatasetReference,
    text: revision.text,
    textHash: revision.textHash,
    createdAt: revision.createdAt,
  };
}
export function publicTrackingPrompt(
  prompt: AiPrompt & { revisions: AiPromptRevision[] },
  topics: readonly AiTopic[],
) {
  return {
    id: prompt.publicId,
    topicId: topics.find((topic) => topic.id === prompt.topicId)?.publicId ?? null,
    label: prompt.label,
    archivedAt: prompt.archivedAt,
    pausedAt: prompt.pausedAt,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
    revisions: prompt.revisions.map(publicTrackingRevision),
  };
}
export function publicTrackingSchedule(schedule: AiTrackingSchedule, prompts: readonly AiPrompt[]) {
  const configuration = schedule.configuration as unknown as PlanTrackingRunInput;
  return {
    id: schedule.publicId,
    name: schedule.name,
    cron: schedule.cron,
    timezone: schedule.timezone,
    enabled: schedule.enabled,
    archivedAt: schedule.archivedAt,
    nextRunAt: schedule.nextRunAt,
    configuration: {
      configurations: configuration.configurations,
      promptIds: configuration.promptIds
        .map((id) => prompts.find((prompt) => prompt.id === id)?.publicId)
        .filter(Boolean),
    },
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}
export function publicTrackingRun(
  run: AiTrackingRun & { _count?: { samples: number }; samples?: unknown[] },
) {
  return {
    id: run.publicId,
    state: run.state,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt,
    plannedAt: run.plannedAt,
    sampleCount: run._count?.samples ?? run.samples?.length ?? null,
  };
}
