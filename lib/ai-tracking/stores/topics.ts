import { DEFAULT_TRACKING_LIMITS, type TrackingLimits } from "@/lib/ai-tracking/contract";
import { topicInputSchema } from "@/lib/ai-tracking/schema";
import { makePublicId } from "@/lib/db/public-id-resources";
import { activeTrackingPromptWhere, lockTrackingProject, prisma, requireFound } from "./shared";
import type { TopicInput } from "./signatures";

export function listTopics(projectId: string) {
  return prisma.aiTopic.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export function createTopic(
  projectId: string,
  input: TopicInput,
  limits: TrackingLimits = DEFAULT_TRACKING_LIMITS,
) {
  const { paused, ...data } = topicInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    if (
      !paused &&
      (await tx.aiTopic.count({ where: { projectId, archivedAt: null, pausedAt: null } })) >=
        limits.topics
    )
      throw new Error("Tracking topic limit reached.");
    return tx.aiTopic.create({
      data: {
        ...data,
        projectId,
        pausedAt: paused ? new Date() : null,
        publicId: makePublicId("ait"),
      },
    });
  });
}
export async function updateTopic(
  projectId: string,
  topicId: string,
  input: Partial<TopicInput>,
  limits: TrackingLimits = DEFAULT_TRACKING_LIMITS,
) {
  const { paused, ...data } = topicInputSchema.partial().parse(input);
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    requireFound(
      await tx.aiTopic.findFirst({ where: { projectId, id: topicId, archivedAt: null } }),
      "Topic",
    );
    const updated = await tx.aiTopic.update({
      where: { id: topicId },
      data: { ...data, pausedAt: paused === undefined ? undefined : paused ? new Date() : null },
    });
    if (paused === false) {
      if (
        (await tx.aiTopic.count({ where: { projectId, archivedAt: null, pausedAt: null } })) >
          limits.topics ||
        (await tx.aiPrompt.count({ where: activeTrackingPromptWhere(projectId) })) >
          limits.activePrompts
      )
        throw new Error("Tracking active resource limit reached.");
    }
    return updated;
  });
}
export async function archiveTopic(projectId: string, topicId: string) {
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const topic = requireFound(
      await tx.aiTopic.findFirst({ where: { projectId, id: topicId } }),
      "Topic",
    );
    return tx.aiTopic.update({
      where: { id: topicId },
      data: { archivedAt: topic.archivedAt ?? new Date() },
    });
  });
}
