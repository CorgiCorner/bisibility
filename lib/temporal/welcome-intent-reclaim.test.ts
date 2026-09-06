import { describe, expect, it, vi } from "vitest";
import {
  sweepWelcomeFollowupIntents,
  WELCOME_FOLLOWUP_MAX_AGE_MS,
} from "./welcome-intent-processor";

type IntentRow = {
  id: string;
  welcomeFollowupExpiredAt: Date | null;
  welcomeFollowupFinishedAt: Date | null;
  welcomeFollowupRequestedAt: Date | null;
  welcomeFollowupStartedAt: Date | null;
};

function matchesDate(value: Date | null, expected: unknown) {
  if (expected === undefined) return true;
  if (expected === null) return value === null;
  if (expected instanceof Date) return value?.getTime() === expected.getTime();
  if (value === null || typeof expected !== "object" || expected === null) return false;
  const comparison = expected as { gt?: Date; gte?: Date; lt?: Date; lte?: Date };
  return (
    (comparison.gt === undefined || value > comparison.gt) &&
    (comparison.gte === undefined || value >= comparison.gte) &&
    (comparison.lt === undefined || value < comparison.lt) &&
    (comparison.lte === undefined || value <= comparison.lte)
  );
}

function matchesWhere(row: IntentRow, where: Record<string, unknown>) {
  const startedAtOptions = where.OR as Record<string, unknown>[] | undefined;
  return (
    (where.id === undefined || row.id === where.id) &&
    matchesDate(row.welcomeFollowupExpiredAt, where.welcomeFollowupExpiredAt) &&
    matchesDate(row.welcomeFollowupFinishedAt, where.welcomeFollowupFinishedAt) &&
    matchesDate(row.welcomeFollowupRequestedAt, where.welcomeFollowupRequestedAt) &&
    matchesDate(row.welcomeFollowupStartedAt, where.welcomeFollowupStartedAt) &&
    (startedAtOptions === undefined ||
      startedAtOptions.some((option) =>
        matchesDate(row.welcomeFollowupStartedAt, option.welcomeFollowupStartedAt),
      ))
  );
}

function intentClient(rows: IntentRow[]) {
  const user = {
    async findFirst({ where }: { where: Record<string, unknown> }) {
      const row = rows.find((candidate) => matchesWhere(candidate, where));
      return row
        ? {
            id: row.id,
            welcomeFollowupRequestedAt: row.welcomeFollowupRequestedAt,
            welcomeFollowupStartedAt: row.welcomeFollowupStartedAt,
          }
        : null;
    },
    async updateMany({
      data,
      where,
    }: {
      data: Record<string, Date>;
      where: Record<string, unknown>;
    }) {
      const claimedRows = rows.filter((row) => matchesWhere(row, where));
      for (const row of claimedRows) Object.assign(row, data);
      return { count: claimedRows.length };
    },
  };
  return {
    $transaction: (callback: (transaction: { user: typeof user }) => unknown) => callback({ user }),
    user,
  };
}

describe("welcome follow-up stale claims", () => {
  it("reclaims a claim older than the stale window and dispatches it once", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const row: IntentRow = {
      id: "user_stale_claim",
      welcomeFollowupExpiredAt: null,
      welcomeFollowupFinishedAt: null,
      welcomeFollowupRequestedAt: new Date(now.getTime() - 60 * 60 * 1000),
      welcomeFollowupStartedAt: new Date(now.getTime() - 36 * 60 * 1000),
    };
    const startWorkflow = vi.fn(async () => undefined);

    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await expect(
        sweepWelcomeFollowupIntents({ client: intentClient([row]) as never, startWorkflow }),
      ).resolves.toEqual({ dispatched: 1, expired: 0 });
    } finally {
      vi.useRealTimers();
    }

    expect(startWorkflow).toHaveBeenCalledOnce();
    expect(row.welcomeFollowupFinishedAt).toEqual(now);
  });

  it("expires a stale failed claim after seven days instead of leaving it stranded", async () => {
    const firstAttempt = new Date("2026-08-26T12:00:00.000Z");
    const row: IntentRow = {
      id: "user_failed_claim",
      welcomeFollowupExpiredAt: null,
      welcomeFollowupFinishedAt: null,
      welcomeFollowupRequestedAt: new Date(firstAttempt.getTime() - 60 * 1000),
      welcomeFollowupStartedAt: null,
    };
    const startWorkflow = vi.fn(async () => {
      throw new Error("temporarily unavailable");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.useFakeTimers();
    vi.setSystemTime(firstAttempt);
    try {
      await sweepWelcomeFollowupIntents({ client: intentClient([row]) as never, startWorkflow });
      vi.setSystemTime(new Date(firstAttempt.getTime() + WELCOME_FOLLOWUP_MAX_AGE_MS + 60_000));
      await expect(
        sweepWelcomeFollowupIntents({ client: intentClient([row]) as never, startWorkflow }),
      ).resolves.toEqual({ dispatched: 0, expired: 1 });
    } finally {
      vi.useRealTimers();
      consoleError.mockRestore();
    }

    expect(startWorkflow).toHaveBeenCalledOnce();
    expect(row.welcomeFollowupExpiredAt).not.toBeNull();
    expect(row.welcomeFollowupFinishedAt).toBeNull();
  });
});
