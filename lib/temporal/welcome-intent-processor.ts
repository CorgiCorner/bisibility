import "server-only";

import { prisma } from "../db/prisma";
import { startWelcomeFollowupWorkflow } from "./welcome-email-client";

export const WELCOME_FOLLOWUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const WELCOME_FOLLOWUP_SWEEP_LIMIT = 25;
export const WELCOME_FOLLOWUP_STALE_CLAIM_MINUTES = 35;

type WelcomeIntentClient = Pick<typeof prisma, "$transaction" | "user">;
type WelcomeClaim = { id: string; requestedAt: Date; startedAt: Date };

function olderThan(now: Date, milliseconds: number) {
  return new Date(now.getTime() - milliseconds);
}

function reclaimableWelcomeFollowupClaimWhere(now: Date) {
  const staleBefore = olderThan(now, WELCOME_FOLLOWUP_STALE_CLAIM_MINUTES * 60 * 1000);
  return {
    OR: [{ welcomeFollowupStartedAt: null }, { welcomeFollowupStartedAt: { lt: staleBefore } }],
  };
}

export async function expireWelcomeFollowupIntents(
  now: Date,
  client: WelcomeIntentClient = prisma,
) {
  return client.user.updateMany({
    data: { welcomeFollowupExpiredAt: now },
    where: {
      ...reclaimableWelcomeFollowupClaimWhere(now),
      welcomeFollowupFinishedAt: null,
      welcomeFollowupExpiredAt: null,
      welcomeFollowupRequestedAt: { lte: olderThan(now, WELCOME_FOLLOWUP_MAX_AGE_MS) },
    },
  });
}

export function countExpiredWelcomeFollowupIntents(client: WelcomeIntentClient = prisma) {
  return client.user.count({ where: { welcomeFollowupExpiredAt: { not: null } } });
}

export async function claimWelcomeFollowupIntent(
  now: Date,
  client: WelcomeIntentClient = prisma,
): Promise<WelcomeClaim | null> {
  return client.$transaction(async (transaction) => {
    const candidate = await transaction.user.findFirst({
      orderBy: [{ welcomeFollowupRequestedAt: "asc" }, { id: "asc" }],
      select: { id: true, welcomeFollowupRequestedAt: true, welcomeFollowupStartedAt: true },
      where: {
        ...reclaimableWelcomeFollowupClaimWhere(now),
        welcomeFollowupExpiredAt: null,
        welcomeFollowupFinishedAt: null,
        welcomeFollowupRequestedAt: { gte: olderThan(now, WELCOME_FOLLOWUP_MAX_AGE_MS) },
      },
    });
    if (!candidate?.welcomeFollowupRequestedAt) return null;

    const claimed = await transaction.user.updateMany({
      data: { welcomeFollowupStartedAt: now },
      where: {
        id: candidate.id,
        welcomeFollowupStartedAt: candidate.welcomeFollowupStartedAt,
        welcomeFollowupExpiredAt: null,
        welcomeFollowupFinishedAt: null,
        welcomeFollowupRequestedAt: { gt: olderThan(now, WELCOME_FOLLOWUP_MAX_AGE_MS) },
      },
    });
    return claimed.count === 1
      ? { id: candidate.id, requestedAt: candidate.welcomeFollowupRequestedAt, startedAt: now }
      : null;
  });
}

async function markWelcomeFollowupFinished(
  claim: WelcomeClaim,
  now: Date,
  client: WelcomeIntentClient,
) {
  await client.user.updateMany({
    data: { welcomeFollowupFinishedAt: now },
    where: {
      id: claim.id,
      welcomeFollowupExpiredAt: null,
      welcomeFollowupFinishedAt: null,
      welcomeFollowupStartedAt: claim.startedAt,
    },
  });
}

export async function sweepWelcomeFollowupIntents(
  options: {
    client?: WelcomeIntentClient;
    limit?: number;
    startWorkflow?: (userId: string) => Promise<unknown>;
  } = {},
) {
  const client = options.client ?? prisma;
  const limit = options.limit ?? WELCOME_FOLLOWUP_SWEEP_LIMIT;
  let expired = 0;
  let dispatched = 0;

  for (let index = 0; index < limit; index += 1) {
    const expiration = await expireWelcomeFollowupIntents(new Date(), client);
    expired += expiration.count;
    const claim = await claimWelcomeFollowupIntent(new Date(), client);
    if (!claim) {
      const finalExpiration = await expireWelcomeFollowupIntents(new Date(), client);
      expired += finalExpiration.count;
      break;
    }
    try {
      await (options.startWorkflow ?? startWelcomeFollowupWorkflow)(claim.id);
      await markWelcomeFollowupFinished(claim, new Date(), client);
      dispatched += 1;
    } catch {
      console.error("[welcome] follow-up workflow start failed", { userId: claim.id });
    }
  }

  return { dispatched, expired };
}
