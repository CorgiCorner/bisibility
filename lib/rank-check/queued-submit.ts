import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { consumeProviderLimit, writeCooldown } from "@/lib/providers/rate-limit";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import {
  DataForSeoAmbiguousSubmissionError,
  submitDataForSeoQueuedTasks,
} from "@/lib/providers/serp/dataforseo-queued";
import type { SerpDevice } from "@/lib/providers/types";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { serpRankLocation } from "@/lib/serp/location";
import { resolveSerpDepth, resolveSerpStopOnMatch } from "@/lib/serp/markets";
import { queuedRankCheckConfig } from "./queued-config";
import { deferQueuedRankCheckBatch } from "./queued-lifecycle";
import { queuedRankCheckModeAuthorization } from "./queued-mode";
import { ACTIVE_QUEUED_BATCH_STATES } from "./queued-state";
import { rankCheckSchedulerMode } from "./scheduler-mode";

const TERMINAL_STATES = new Set(["completed", "deferred", "failed"]);

async function markAmbiguous(batchId: string, message: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.queuedRankCheckTask.updateMany({
      data: { error: message, state: "ambiguous" },
      where: { batchId, state: { in: ["prepared", "submitting"] } },
    }),
    prisma.queuedRankCheckBatch.updateMany({
      data: { ambiguousAt: now, error: message, state: "ambiguous" },
      where: { id: batchId, state: { in: ["prepared", "submitting"] } },
    }),
  ]);
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return { state: batch.state };
}

async function claimSubmission(batchId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queued-rank-submit:${batchId}`}))`;
    const batch = await tx.queuedRankCheckBatch.findUniqueOrThrow({
      include: {
        connection: true,
        project: { include: { defaults: true } },
        tasks: {
          include: {
            keyword: { include: { locationRef: true, schedule: true } },
            rankCheck: { select: { requestedDepth: true } },
          },
          orderBy: { id: "asc" },
        },
      },
      where: { id: batchId },
    });
    if (batch.state === "submitting") return { batch, claimed: false };
    if (batch.state !== "prepared") return { batch, claimed: false };
    const claimed = await tx.queuedRankCheckBatch.updateMany({
      data: { state: "submitting" },
      where: { id: batchId, state: "prepared" },
    });
    if (claimed.count === 0) return { batch, claimed: false };
    await tx.queuedRankCheckTask.updateMany({
      data: { state: "submitting" },
      where: { batchId, state: "prepared" },
    });
    return { batch, claimed: true };
  });
}

function providerTasks(batch: Awaited<ReturnType<typeof claimSubmission>>["batch"]) {
  return batch.tasks.map((task) => ({
    correlationId: task.id,
    depth: resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined),
    device: task.keyword.device as SerpDevice,
    domain: trackedProjectDomain(batch.project.domain) ?? "",
    keyword: task.keyword.text,
    location: serpRankLocation(task.keyword.locationRef),
    stopOnMatch: resolveSerpStopOnMatch(batch.project.defaults?.serpStopOnMatch),
  }));
}

async function markDefiniteFailure(batchId: string, message: string) {
  await prisma.$transaction([
    prisma.queuedRankCheckTask.updateMany({
      data: { error: message, state: "provider_failed" },
      where: { batchId, state: { in: ["prepared", "submitting"] } },
    }),
    prisma.queuedRankCheckBatch.updateMany({
      data: { error: message, state: "ready" },
      where: { id: batchId, state: { in: ACTIVE_QUEUED_BATCH_STATES } },
    }),
  ]);
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return { state: batch.state };
}

export async function submitQueuedRankCheckBatch(batchId: string) {
  const schedulerMode = rankCheckSchedulerMode();
  const existing = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  const authorization = queuedRankCheckModeAuthorization(schedulerMode, existing.state);
  if (!authorization.allowSubmit) {
    if (authorization.allowPaidRetrieval) return { state: existing.state };
    const progress = await deferQueuedRankCheckBatch(
      batchId,
      `Queued provider submission is disabled in ${schedulerMode} scheduler mode.`,
    );
    return { state: progress.state };
  }
  const claimed = await claimSubmission(batchId);
  if (TERMINAL_STATES.has(claimed.batch.state)) return { state: claimed.batch.state };
  if (!claimed.claimed) {
    return claimed.batch.state === "submitting"
      ? markAmbiguous(
          batchId,
          "Submission activity resumed after the paid-call fence; recovering by task tag.",
        )
      : { state: claimed.batch.state };
  }

  const config = queuedRankCheckConfig();
  if (!config.enabled) {
    const progress = await deferQueuedRankCheckBatch(
      batchId,
      "Queued DataForSEO rank checks were disabled before submission.",
    );
    return { state: progress.state };
  }
  const connection = claimed.batch.connection;
  if (!connection) {
    return markDefiniteFailure(batchId, "DataForSEO connection was removed before submission.");
  }
  const credentials = resolveProviderCredentials("dataforseo", connection.credentialsEncrypted);
  const rate = await consumeProviderLimit("dataforseo", credentials, {
    projectId: claimed.batch.projectId,
  });
  if (!rate.success) {
    const progress = await deferQueuedRankCheckBatch(
      batchId,
      "DataForSEO provider rate limit or cooldown prevented queued submission.",
    );
    return { state: progress.state };
  }

  try {
    const result = await submitDataForSeoQueuedTasks({
      credentials,
      priority: claimed.batch.priority === "normal" ? "normal" : "high",
      tasks: providerTasks(claimed.batch),
    });
    await prisma.$transaction(async (tx) => {
      for (const task of result.accepted) {
        await tx.queuedRankCheckTask.updateMany({
          data: {
            costCents: task.costCents,
            error: null,
            providerTaskId: task.providerTaskId,
            state: "submitted",
          },
          where: { id: task.correlationId, state: "submitting" },
        });
      }
      for (const task of result.failed) {
        await tx.queuedRankCheckTask.updateMany({
          data: { costCents: task.costCents, error: task.message, state: "provider_failed" },
          where: { id: task.correlationId, state: "submitting" },
        });
      }
      await tx.queuedRankCheckBatch.updateMany({
        data: { state: "submitted", submittedAt: new Date() },
        where: { id: batchId, state: "submitting" },
      });
    });
    const authoritative = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
      select: { state: true },
      where: { id: batchId },
    });
    return { state: authoritative.state };
  } catch (error) {
    if (error instanceof DataForSeoAmbiguousSubmissionError) {
      return markAmbiguous(batchId, error.message);
    }
    if (error instanceof DataForSeoError && error.httpStatus === 429) {
      writeCooldown(rate.accountKey);
      const progress = await deferQueuedRankCheckBatch(batchId, error.message);
      return { state: progress.state };
    }
    return markDefiniteFailure(
      batchId,
      error instanceof Error ? error.message : "DataForSEO task submission failed.",
    );
  }
}
