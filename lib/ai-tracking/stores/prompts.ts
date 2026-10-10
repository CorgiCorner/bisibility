import { DEFAULT_TRACKING_LIMITS, type TrackingLimits } from "@/lib/ai-tracking/contract";
import { exactTextHash } from "@/lib/ai-tracking/identity";
import { promptInputSchema } from "@/lib/ai-tracking/schema";
import { makePublicId } from "@/lib/db/public-id-resources";
import { Prisma } from "@/lib/generated/prisma/client";
import { resolvePromptProvenance } from "./prompt-provenance";
import {
  activeTrackingPromptWhere,
  jsonInput,
  lockTrackingProject,
  prisma,
  requireFound,
  type TrackingTransaction,
} from "./shared";
import type { PromptInput } from "./signatures";

const revisions = { orderBy: { ordinal: "desc" as const } };
export function listPrompts(projectId: string) {
  return prisma.aiPrompt.findMany({
    where: { projectId },
    include: { revisions },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export async function listPromptRevisions(projectId: string, promptId: string) {
  requireFound(await prisma.aiPrompt.findFirst({ where: { projectId, id: promptId } }), "Prompt");
  return prisma.aiPromptRevision.findMany({
    where: { projectId, promptId },
    orderBy: { ordinal: "desc" },
  });
}
async function topicExists(tx: TrackingTransaction, projectId: string, topicId?: string | null) {
  if (topicId)
    requireFound(
      await tx.aiTopic.findFirst({ where: { projectId, id: topicId, archivedAt: null } }),
      "Topic",
    );
}
export function createPrompt(
  projectId: string,
  input: PromptInput,
  limits: TrackingLimits = DEFAULT_TRACKING_LIMITS,
) {
  const data = promptInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    await topicExists(tx, projectId, data.topicId);
    const provenance = await resolvePromptProvenance(tx, projectId, data);
    const created = await tx.aiPrompt.create({
      data: {
        projectId,
        publicId: makePublicId("aip"),
        pausedAt: data.paused ? new Date() : null,
        topicId: data.topicId,
        label: data.label,
        revisions: {
          create: {
            publicId: makePublicId("apr"),
            ordinal: 1,
            category: data.category ?? "neutral",
            text: data.text,
            textHash: exactTextHash(data.text),
            ...provenance,
          },
        },
      },
      include: { revisions },
    });
    if (
      (await tx.aiPrompt.count({ where: activeTrackingPromptWhere(projectId) })) >
      limits.activePrompts
    )
      throw new Error("Tracking prompt limit reached.");
    return created;
  });
}
export function updatePrompt(
  projectId: string,
  promptId: string,
  input: Partial<PromptInput>,
  limits: TrackingLimits = DEFAULT_TRACKING_LIMITS,
) {
  const data = promptInputSchema.partial().parse(input);
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    await topicExists(tx, projectId, data.topicId);
    const prompt = requireFound(
      await tx.aiPrompt.findFirst({
        where: { projectId, id: promptId, archivedAt: null },
        include: { revisions: { ...revisions, take: 1 } },
      }),
      "Prompt",
    );
    const current = prompt.revisions[0];
    const text = data.text ?? current?.text;
    const category = data.category ?? current?.category ?? "neutral";
    const sourceChanged = Boolean(data.generationReference || data.providerDatasetReference);
    const provenance = sourceChanged
      ? await resolvePromptProvenance(tx, projectId, data)
      : {
          generationId: current?.generationId ?? null,
          generationDraftId: current?.generationDraftId ?? null,
          provenance: current?.provenance ? jsonInput(current.provenance) : Prisma.DbNull,
        };
    if (
      text !== undefined &&
      (current?.text !== text || current?.category !== category || sourceChanged)
    ) {
      await tx.aiPromptRevision.create({
        data: {
          projectId,
          promptId,
          publicId: makePublicId("apr"),
          ordinal: (current?.ordinal ?? 0) + 1,
          category,
          text,
          textHash: exactTextHash(text),
          ...provenance,
        },
      });
    }
    const updated = await tx.aiPrompt.update({
      where: { id: promptId },
      data: {
        topicId: data.topicId,
        label: data.label,
        pausedAt: data.paused === undefined ? undefined : data.paused ? new Date() : null,
      },
      include: { revisions },
    });
    if (
      (await tx.aiPrompt.count({ where: activeTrackingPromptWhere(projectId) })) >
      limits.activePrompts
    )
      throw new Error("Tracking prompt limit reached.");
    return updated;
  });
}
export function archivePrompt(projectId: string, promptId: string) {
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const prompt = requireFound(
      await tx.aiPrompt.findFirst({ where: { projectId, id: promptId } }),
      "Prompt",
    );
    return tx.aiPrompt.update({
      where: { id: promptId },
      data: { archivedAt: prompt.archivedAt ?? new Date() },
      include: { revisions },
    });
  });
}
