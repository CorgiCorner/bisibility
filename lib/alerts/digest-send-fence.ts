import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { ApplicationFailure } from "@temporalio/common";
import type { AlertDigestJob } from "./digest-types";
import { ALERT_NOT_DELIVERABLE } from "./send-gate";

type SendOutcome = { delivered: boolean; skipped?: boolean; unknown?: boolean; reason?: string };
const unknown: SendOutcome = {
  delivered: false,
  unknown: true,
  reason: "Digest submission outcome is unknown.",
};
const refused: SendOutcome = { delivered: false, skipped: true, reason: ALERT_NOT_DELIVERABLE };

/** The row lock serializes submission with reclaim, even for overlapping batch membership. */
async function begin(job: AlertDigestJob, channel: string, destination: string) {
  const ids = [...new Set(job.alertIds)].sort();
  if (!job.deliveryClaimToken || !ids.length || !destination) return refused;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        deliveryState: string;
        deliveryClaimToken: string | null;
        digestSubmissionStarted: boolean | null;
      }>
    >(Prisma.sql`
      SELECT "id", "deliveryState", "deliveryClaimToken", "digestSubmissionStarted" FROM "triggered_alerts"
      WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE
    `);
    if (
      rows.length !== ids.length ||
      rows.some(
        (row) =>
          row.deliveryState !== "digesting" || row.deliveryClaimToken !== job.deliveryClaimToken,
      )
    )
      return refused;
    if (rows.some((row) => row.digestSubmissionStarted === null)) return unknown;
    const previous = await tx.alertDigestSend.findMany({
      where: { alertId: { in: ids }, channel, destination },
    });
    if (previous.some((row) => row.ownerToken !== job.deliveryClaimToken)) return refused;
    if (
      previous.length &&
      previous.every((row) => row.state === "accepted") &&
      previous.length === ids.length
    )
      return { delivered: true };
    if (previous.length === ids.length && previous.every((row) => row.state === "failed"))
      return { delivered: false, reason: "Digest delivery was rejected." };
    if (
      previous.length &&
      (previous.length !== ids.length || previous.some((row) => row.state !== "retryable"))
    )
      return unknown;
    await tx.triggeredAlert.updateMany({
      data: { digestSubmissionStarted: true, deliveryClaimedAt: new Date() },
      where: {
        id: { in: ids },
        deliveryClaimToken: job.deliveryClaimToken,
        deliveryState: "digesting",
      },
    });
    if (previous.length)
      await tx.alertDigestSend.updateMany({
        data: { state: "submitting" },
        where: {
          alertId: { in: ids },
          channel,
          destination,
          ownerToken: job.deliveryClaimToken,
          state: "retryable",
        },
      });
    else
      await tx.alertDigestSend.createMany({
        data: ids.map((alertId) => ({
          alertId,
          channel,
          destination,
          ownerToken: job.deliveryClaimToken,
          state: "submitting",
        })),
      });
    return null;
  });
}

async function finish(job: AlertDigestJob, channel: string, destination: string, state: string) {
  const ids = [...new Set(job.alertIds)].sort();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "triggered_alerts" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
    );
    const result = await tx.alertDigestSend.updateMany({
      data: { state },
      where: {
        alertId: { in: ids },
        channel,
        destination,
        ownerToken: job.deliveryClaimToken,
        state: "submitting",
      },
    });
    if (result.count !== ids.length) return false;
    if (state === "skipped") {
      const exposed = await tx.alertDigestSend.count({
        where: {
          alertId: { in: ids },
          state: { in: ["submitting", "accepted", "unknown", "retryable"] },
        },
      });
      if (exposed === 0)
        await tx.triggeredAlert.updateMany({
          data: { digestSubmissionStarted: false },
          where: {
            id: { in: ids },
            deliveryClaimToken: job.deliveryClaimToken,
            deliveryState: "digesting",
          },
        });
    }
    return true;
  });
}

export async function fencedDigestSend(
  job: AlertDigestJob,
  channel: string,
  destination: string,
  send: () => Promise<SendOutcome>,
): Promise<SendOutcome> {
  const existing = await begin(job, channel, destination);
  if (existing) return existing;
  try {
    const result = await send();
    const state = result.unknown
      ? "unknown"
      : result.delivered
        ? "accepted"
        : result.skipped
          ? "skipped"
          : "failed";
    return (await finish(job, channel, destination, state)) ? result : unknown;
  } catch (error) {
    // An explicit rate-limit rejection is safe to retry under the same owner.
    if (error instanceof ApplicationFailure && error.type === "rate_limited") {
      if (await finish(job, channel, destination, "retryable")) throw error;
      return unknown;
    }
    await finish(job, channel, destination, "unknown").catch(() => false);
    return unknown;
  }
}
