import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ScheduleReviewStaleError } from "./errors";

export type ScheduleReviewPermit = Readonly<{ projectId: string }>;

type PermitRow = {
  actorId: string;
  consent: unknown;
  projectId: string;
  token: string;
};

const TOKEN_TTL_MS = 10 * 60 * 1000;
const permits = new WeakMap<ScheduleReviewPermit, PermitRow>();
/** Tokens whose transaction committed. Evicted at the preview token's expiry. */
const spent = new Map<string, number>();

type TransactionRunner = <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
) => Promise<T>;

/** Drops the in-process spent hint so a test can reach the receipt unique index. */
export function clearScheduleReviewSpentForTests() {
  spent.clear();
}

function evictSpent(now = Date.now()) {
  for (const [token, expiresAt] of spent) {
    if (expiresAt <= now) spent.delete(token);
  }
}

/** Minted only after the server has verified the preview token. */
export function mintSchedulePermit(
  token: string,
  projectId: string,
  actorId: string,
  consent: unknown,
): ScheduleReviewPermit {
  evictSpent();
  const permit = Object.freeze({ projectId });
  permits.set(permit, { actorId, consent, projectId, token });
  return permit;
}

function takePermit(permit: ScheduleReviewPermit, projectId: string, actorId: string) {
  const row = permits.get(permit);
  if (!row || row.projectId !== projectId || row.actorId !== actorId) {
    throw new ScheduleReviewStaleError("preview_reused");
  }
  permits.delete(permit);
  return row;
}

/**
 * The in-process record is an in-request hint. The database receipt is the
 * spend that survives another instance. A rolled-back mutation does not record it.
 */
export async function runWithSchedulePermit<T>(
  permit: ScheduleReviewPermit,
  projectId: string,
  actorId: string,
  run: (consent: unknown, tx: Prisma.TransactionClient) => Promise<T>,
  transaction: TransactionRunner = (callback, options) =>
    prisma.$transaction(callback, options ?? { maxWait: 10_000, timeout: 60_000 }),
): Promise<T> {
  evictSpent();
  const row = permits.get(permit);
  if (!row || spent.has(row.token)) throw new ScheduleReviewStaleError("preview_reused");
  const result = await transaction(
    async (tx) => {
      const taken = takePermit(permit, projectId, actorId);
      return run(taken.consent, tx);
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
  spent.set(row.token, Date.now() + TOKEN_TTL_MS);
  return result;
}
