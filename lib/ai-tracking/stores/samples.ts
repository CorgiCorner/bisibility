import type {
  CostReceipt,
  DispatchState,
  PersistTrackingResultInput,
} from "@/lib/ai-tracking/contract";
import { boundedRaw, boundedUtf8, payloadHash } from "@/lib/ai-tracking/identity";
import { persistTrackingResultSchema } from "@/lib/ai-tracking/schema";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  jsonInput,
  lockTrackingProject,
  prisma,
  requireFound,
  type TrackingTransaction,
} from "./shared";

const NEXT: Record<DispatchState, DispatchState[]> = {
  planned: ["claimed"],
  claimed: ["submission_started", "submission_unknown", "terminal"],
  submission_started: ["submitted", "submission_unknown", "terminal"],
  submitted: ["collecting", "submission_unknown", "terminal"],
  collecting: ["submission_unknown", "terminal"],
  submission_unknown: ["submitted", "collecting", "terminal"],
  terminal: [],
};
export interface TransitionTrackingSampleInput {
  attemptId: string;
  expectedDispatch: DispatchState;
  nextDispatch: DispatchState;
  providerTaskId?: string;
  receipt?: CostReceipt;
  nextPollAt?: string | null;
}
export function getTrackingSample(projectId: string, sampleId: string) {
  return prisma.aiTrackingSample.findFirst({
    where: { projectId, OR: [{ id: sampleId }, { publicId: sampleId }] },
    include: { citations: true, observations: true },
  });
}
export function claimTrackingSample(projectId: string, sampleId: string, attemptId: string) {
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const sample = await tx.aiTrackingSample.findFirst({
      where: {
        projectId,
        id: sampleId,
        attemptId,
        dispatch: "planned",
        run: { state: { in: ["planned", "running"] } },
      },
    });
    if (!sample) return null;
    const changed = await tx.aiTrackingSample.updateMany({
      where: { projectId, id: sampleId, attemptId, dispatch: "planned" },
      data: { dispatch: "claimed", claimedAt: new Date() },
    });
    if (!changed.count) return null;
    await tx.aiTrackingRun.updateMany({
      where: { projectId, id: sample.runId, state: "planned" },
      data: { state: "running" },
    });
    return tx.aiTrackingSample.findUniqueOrThrow({ where: { id: sampleId } });
  });
}
export function transitionTrackingSample(
  projectId: string,
  sampleId: string,
  input: TransitionTrackingSampleInput,
) {
  if (!NEXT[input.expectedDispatch].includes(input.nextDispatch))
    throw new Error("Invalid tracking dispatch transition.");
  if (input.nextDispatch === "terminal")
    throw new Error("Terminal samples require a persisted result.");
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const sample = await tx.aiTrackingSample.findFirst({
      where: {
        projectId,
        id: sampleId,
        attemptId: input.attemptId,
        dispatch: input.expectedDispatch,
      },
    });
    if (!sample) return null;
    if (input.receipt?.providerCostEntryId) {
      requireFound(
        await tx.providerCostEntry.findFirst({
          where: { projectId, id: input.receipt.providerCostEntryId },
        }),
        "Provider receipt",
      );
    }
    const changed = await tx.aiTrackingSample.updateMany({
      where: {
        projectId,
        id: sampleId,
        attemptId: input.attemptId,
        dispatch: input.expectedDispatch,
        ...(input.nextDispatch === "submission_started"
          ? { run: { state: { not: "cancelled" as const } } }
          : {}),
      },
      data: {
        nextPollAt:
          input.nextPollAt === undefined
            ? undefined
            : input.nextPollAt === null
              ? null
              : new Date(input.nextPollAt),
        dispatch: input.nextDispatch,
        providerTaskId: input.providerTaskId,
        receipt: input.receipt ? jsonInput(input.receipt) : undefined,
        providerCostEntryId: input.receipt?.providerCostEntryId,
      },
    });
    return changed.count
      ? tx.aiTrackingSample.findUniqueOrThrow({ where: { id: sampleId } })
      : null;
  });
}
async function finishRun(tx: TrackingTransaction, projectId: string, runId: string) {
  const remaining = await tx.aiTrackingSample.count({
    where: { projectId, runId, dispatch: { not: "terminal" } },
  });
  if (remaining) return;
  const samples = await tx.aiTrackingSample.findMany({
    where: { projectId, runId },
    select: { measurement: true },
  });
  const successes = samples.filter((sample) =>
    ["answer_present", "aio_not_present"].includes(sample.measurement),
  ).length;
  const state =
    successes === samples.length
      ? "completed"
      : successes > 0 || samples.some((sample) => sample.measurement === "partial")
        ? "partial"
        : samples.every((sample) => sample.measurement === "unavailable")
          ? "blocked"
          : "failed";
  await tx.aiTrackingRun.updateMany({
    where: { projectId, id: runId, state: { in: ["running", "planned"] } },
    data: { state, finishedAt: new Date() },
  });
}
export function persistTrackingResult(
  projectId: string,
  sampleId: string,
  input: PersistTrackingResultInput,
) {
  input = persistTrackingResultSchema.parse(input);
  if (input.evidence.recordedSource !== "fresh")
    throw new Error("Cached observations cannot become fresh tracking samples.");
  if (!NEXT[input.expectedDispatch].includes("terminal"))
    throw new Error("Sample cannot accept a terminal result from this state.");
  if (input.receipt.amountUsd !== null && !/^\d+(\.\d+)?$/.test(input.receipt.amountUsd))
    throw new Error("Receipt amount must be a decimal USD string.");
  const answer =
    input.evidence.answerText === null ? null : boundedUtf8(input.evidence.answerText, 256 * 1024);
  const raw = boundedRaw(input.evidence.raw);
  const evidence = {
    ...input.evidence,
    raw: undefined,
    answerText: undefined,
    answerTruncated: input.evidence.answerTruncated || Boolean(answer?.truncated),
    rawTruncated: input.evidence.rawTruncated || raw.truncated,
  };
  const hash = payloadHash(input);
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const sample = await tx.aiTrackingSample.findFirst({
      where: { projectId, id: sampleId, attemptId: input.attemptId },
    });
    if (!sample) return null;
    if (sample.dispatch === "terminal") {
      if (sample.resultHash !== hash)
        throw new Error("Tracking result is bound to a different payload.");
      return tx.aiTrackingSample.findUniqueOrThrow({
        where: { id: sampleId },
        include: { citations: true, observations: true },
      });
    }
    if (input.receipt.providerCostEntryId)
      requireFound(
        await tx.providerCostEntry.findFirst({
          where: { projectId, id: input.receipt.providerCostEntryId },
        }),
        "Provider receipt",
      );
    const competitorIds = [
      ...new Set(
        input.observations
          .map((observation) => observation.competitorId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const run = requireFound(
      await tx.aiTrackingRun.findFirst({
        where: { projectId, id: sample.runId },
        select: { competitorSnapshot: true },
      }),
      "Run",
    );
    const retainedIds = new Set(
      Array.isArray(run.competitorSnapshot)
        ? run.competitorSnapshot.flatMap((entity) =>
            entity &&
            typeof entity === "object" &&
            !Array.isArray(entity) &&
            entity.kind === "competitor" &&
            typeof entity.id === "string"
              ? [entity.id]
              : [],
          )
        : [],
    );
    if (competitorIds.some((id) => !retainedIds.has(id)))
      throw new Error("Competitor not found in retained project snapshot.");
    const changed = await tx.aiTrackingSample.updateMany({
      where: {
        projectId,
        id: sampleId,
        attemptId: input.attemptId,
        dispatch: input.expectedDispatch,
      },
      data: {
        dispatch: "terminal",
        nextPollAt: null,
        measurement: input.measurement,
        evidence: jsonInput(evidence),
        answerText: answer?.text ?? null,
        raw: raw.raw === null ? Prisma.DbNull : jsonInput(raw.raw),
        receipt: jsonInput(input.receipt),
        providerCostEntryId: input.receipt.providerCostEntryId,
        resultHash: hash,
        finishedAt: new Date(),
      },
    });
    if (!changed.count) return null;
    if (input.citations.length)
      await tx.aiTrackingCitation.createMany({
        data: input.citations.map((citation) => ({ ...citation, sampleId })),
      });
    if (input.observations.length)
      await tx.aiTrackingEntityObservation.createMany({
        data: input.observations.map((observation) => ({
          ...observation,
          sampleId,
          snippet: observation.snippet ? boundedUtf8(observation.snippet, 4096).text : null,
        })),
      });
    await finishRun(tx, projectId, sample.runId);
    return tx.aiTrackingSample.findUniqueOrThrow({
      where: { id: sampleId },
      include: { citations: true, observations: true },
    });
  });
}

export async function deferTrackingSamplePoll(
  projectId: string,
  sampleId: string,
  attemptId: string,
  nextPollAt: string,
) {
  const instant = new Date(nextPollAt);
  if (!Number.isFinite(instant.getTime())) throw new Error("Invalid tracking poll time.");
  const changed = await prisma.aiTrackingSample.updateMany({
    where: { projectId, id: sampleId, attemptId, dispatch: "collecting" },
    data: { nextPollAt: instant },
  });
  return Boolean(changed.count);
}
