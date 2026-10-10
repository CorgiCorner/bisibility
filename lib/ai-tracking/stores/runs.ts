import { randomUUID } from "node:crypto";
import type { PlanTrackingRunInput, SamplePlan } from "@/lib/ai-tracking/contract";
import { payloadHash, sourceConfigurationHash } from "@/lib/ai-tracking/identity";
import { planTrackingRunSchema } from "@/lib/ai-tracking/schema";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { Prisma } from "@/lib/generated/prisma/client";
import { assertTrackingRunRetryable } from "./retry-policy";
import { jsonInput, lockTrackingProject, prisma, requireFound } from "./shared";

export function getTrackingRun(projectId: string, runId: string) {
  return prisma.aiTrackingRun.findFirst({
    where: { projectId, OR: [{ id: runId }, { publicId: runId }] },
    include: {
      samples: {
        include: { citations: true, observations: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
}
export function planTrackingRun(projectId: string, input: PlanTrackingRunInput) {
  const parsed = planTrackingRunSchema.parse(input);
  const data = {
    ...parsed,
    promptIds: [...new Set(parsed.promptIds)].sort(),
    configurations: [
      ...new Map(
        parsed.configurations.map((configuration) => [
          sourceConfigurationHash(configuration),
          configuration,
        ]),
      ).entries(),
    ]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, configuration]) => configuration),
  };
  const hash = payloadHash(data);
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const prior = await tx.aiTrackingRun.findUnique({
      where: { projectId_idempotencyKey: { projectId, idempotencyKey: data.idempotencyKey } },
      include: { samples: true },
    });
    if (prior) {
      if (prior.payloadHash !== hash)
        throw new Error("Idempotency key is bound to a different tracking payload.");
      return prior;
    }
    requireFound(
      await tx.providerConnection.findFirst({
        where: { id: data.credentialConnectionId, projectId },
      }),
      "Provider connection",
    );
    if (data.scheduleId) {
      const schedule = requireFound(
        await tx.aiTrackingSchedule.findFirst({
          where: { projectId, id: data.scheduleId, archivedAt: null },
        }),
        "Schedule",
      );
      if (!schedule.enabled) throw new Error("Tracking schedule is disabled.");
      const occurrence = await tx.aiTrackingRun.findUnique({
        where: {
          scheduleId_plannedAt: {
            scheduleId: data.scheduleId,
            plannedAt: new Date(data.plannedAt as string),
          },
        },
        include: { samples: true },
      });
      if (occurrence) {
        if (occurrence.payloadHash !== hash)
          throw new Error("Schedule occurrence is bound to a different tracking payload.");
        return occurrence;
      }
    }
    if (data.retryOfRunId) {
      const priorRun = requireFound(
        await tx.aiTrackingRun.findFirst({
          where: { projectId, id: data.retryOfRunId },
          include: { samples: true },
        }),
        "Retry run",
      );
      assertTrackingRunRetryable(priorRun);
    }
    const retainedPrompts = await tx.aiPrompt.findMany({
      where: { projectId, id: { in: data.promptIds } },
      include: {
        topic: { select: { archivedAt: true, pausedAt: true } },
        revisions: { orderBy: { ordinal: "desc" }, take: 1 },
      },
    });
    const prompts = retainedPrompts.filter(
      (prompt) =>
        prompt.archivedAt === null &&
        prompt.pausedAt === null &&
        (!prompt.topic || (prompt.topic.archivedAt === null && prompt.topic.pausedAt === null)),
    );
    if (
      retainedPrompts.length !== data.promptIds.length ||
      (data.origin === "manual" && prompts.length !== data.promptIds.length) ||
      prompts.some((prompt) => !prompt.revisions.length)
    )
      throw new Error("Active tracking prompts not found.");
    const competitors = await tx.competitor.findMany({
      where: { projectId },
      select: { id: true, publicId: true, domain: true, label: true, aliases: true },
    });
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, publicId: true, name: true, domain: true },
    });
    const snapshot = [
      {
        kind: "project",
        id: project.id,
        publicId: project.publicId,
        label: project.name,
        domain: project.domain,
        aliases: [],
      },
      ...competitors.map((competitor) => ({ ...competitor, kind: "competitor" })),
    ];
    const run = await tx.aiTrackingRun.create({
      data: {
        projectId,
        actorId: data.actorId,
        state: prompts.length ? "planned" : "skipped",
        finishedAt: prompts.length ? null : new Date(),
        publicId: makePublicId("air"),
        scheduleId: data.scheduleId,
        plannedAt: data.plannedAt ? new Date(data.plannedAt) : null,
        idempotencyKey: data.idempotencyKey,
        payloadHash: hash,
        launchPayload: jsonInput(data),
        competitorSnapshot: jsonInput(snapshot),
        retryOfRunId: data.retryOfRunId,
      },
    });
    const samples: Prisma.AiTrackingSampleCreateManyInput[] = [];
    for (const prompt of prompts) {
      const revision = prompt.revisions[0];
      for (const configuration of data.configurations) {
        const sampleId = randomUUID();
        const attemptId = randomUUID();
        const plan: SamplePlan = {
          version: 1,
          projectId,
          actorId: data.actorId,
          actorCredential: data.actorCredential,
          runId: run.id,
          sampleId,
          promptRevisionId: revision.id,
          promptCategory: revision.category,
          promptText: revision.text,
          promptHash: revision.textHash,
          provider: configuration.provider,
          endpoint: configuration.endpoint,
          engine: configuration.engine,
          source: configuration.source,
          requestedParameters: configuration.parameters,
          requestedModel: configuration.model,
          requestHash: payloadHash({ prompt: revision.text, ...configuration }),
          credentialConnectionId: data.credentialConnectionId,
          credentialVersion: data.credentialVersion,
          budgetRevision: data.budgetRevision,
          consentRevision: data.consentRevision,
          origin: data.origin,
          entrySource: data.entrySource,
          attemptId,
          deadline: data.deadline,
        };
        samples.push({
          id: sampleId,
          publicId: makePublicId("asm"),
          projectId,
          runId: run.id,
          promptRevisionId: revision.id,
          source: configuration.source,
          engine: configuration.engine,
          configurationHash: sourceConfigurationHash(configuration),
          attemptId,
          plan: jsonInput(plan),
        });
      }
    }
    if (samples.length) await tx.aiTrackingSample.createMany({ data: samples });
    return tx.aiTrackingRun.findUniqueOrThrow({
      where: { id: run.id },
      include: { samples: true },
    });
  });
}
export function cancelTrackingRun(projectId: string, runId: string) {
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const run = requireFound(
      await tx.aiTrackingRun.findFirst({
        where: { projectId, OR: [{ id: runId }, { publicId: runId }] },
      }),
      "Run",
    );
    if (!["planned", "running"].includes(run.state)) return run;
    await tx.aiTrackingSample.updateMany({
      where: { projectId, runId: run.id, dispatch: { in: ["planned", "claimed"] } },
      data: { dispatch: "terminal", measurement: "unavailable", finishedAt: new Date() },
    });
    return tx.aiTrackingRun.update({
      where: { id: run.id },
      data: { state: "cancelled", finishedAt: new Date() },
    });
  });
}
export async function retryTrackingRun(
  projectId: string,
  runId: string,
  input: PlanTrackingRunInput,
) {
  const run = requireFound(await getTrackingRun(projectId, runId), "Run");
  assertTrackingRunRetryable(run);
  return planTrackingRun(projectId, { ...input, retryOfRunId: run.id });
}
