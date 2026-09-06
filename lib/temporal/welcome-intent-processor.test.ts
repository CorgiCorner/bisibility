import { describe, expect, it, vi } from "vitest";
import {
  countExpiredWelcomeFollowupIntents,
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

function sameDate(left: Date | null, right: Date | null) {
  return left === right || (left !== null && right !== null && left.getTime() === right.getTime());
}

function dateMatches(value: Date | null, expected: unknown) {
  if (expected === undefined) return true;
  if (expected === null) return value === null;
  if (expected instanceof Date) return sameDate(value, expected);
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
  const matchesStartedAt = (expected: unknown) =>
    dateMatches(row.welcomeFollowupStartedAt, expected);
  const startedAtOptions = where.OR as Record<string, unknown>[] | undefined;
  return (
    dateMatches(row.welcomeFollowupExpiredAt, where.welcomeFollowupExpiredAt) &&
    dateMatches(row.welcomeFollowupFinishedAt, where.welcomeFollowupFinishedAt) &&
    dateMatches(row.welcomeFollowupRequestedAt, where.welcomeFollowupRequestedAt) &&
    matchesStartedAt(where.welcomeFollowupStartedAt) &&
    (startedAtOptions === undefined ||
      startedAtOptions.some((option) => matchesStartedAt(option.welcomeFollowupStartedAt))) &&
    (where.id === undefined || row.id === where.id)
  );
}

function intentClient(rows: IntentRow[]) {
  const user = {
    async count() {
      return rows.filter((row) => row.welcomeFollowupExpiredAt !== null).length;
    },
    async findFirst({ where }: { where: Record<string, unknown> }) {
      const row = rows
        .filter((candidate) => matchesWhere(candidate, where))
        .sort(
          (left, right) =>
            (left.welcomeFollowupRequestedAt?.getTime() ?? 0) -
              (right.welcomeFollowupRequestedAt?.getTime() ?? 0) || left.id.localeCompare(right.id),
        )[0];
      if (!row) return null;
      return {
        id: row.id,
        welcomeFollowupRequestedAt: row.welcomeFollowupRequestedAt,
        welcomeFollowupStartedAt: row.welcomeFollowupStartedAt,
      };
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

describe("welcome follow-up intent processing", () => {
  it("starts exactly one workflow when two claimants race for one intent", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const row: IntentRow = {
      id: "user_race",
      welcomeFollowupExpiredAt: null,
      welcomeFollowupFinishedAt: null,
      welcomeFollowupRequestedAt: new Date(now.getTime() - 60_000),
      welcomeFollowupStartedAt: null,
    };
    const client = intentClient([row]);
    const startWorkflow = vi.fn(async () => undefined);

    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await Promise.all([
        sweepWelcomeFollowupIntents({ client: client as never, limit: 1, startWorkflow }),
        sweepWelcomeFollowupIntents({ client: client as never, limit: 1, startWorkflow }),
      ]);
    } finally {
      vi.useRealTimers();
    }

    expect(startWorkflow).toHaveBeenCalledOnce();
    expect(startWorkflow).toHaveBeenCalledWith("user_race");
    expect(row.welcomeFollowupFinishedAt).toEqual(now);
  });

  it("expires an eight-day-old intent and never starts its workflow", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const requestedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const row: IntentRow = {
      id: "user_eight_days_old",
      welcomeFollowupExpiredAt: null,
      welcomeFollowupFinishedAt: null,
      welcomeFollowupRequestedAt: requestedAt,
      welcomeFollowupStartedAt: null,
    };
    const startWorkflow = vi.fn(async () => undefined);

    vi.useFakeTimers();
    vi.setSystemTime(now);
    let result = { dispatched: 0, expired: 0 };
    try {
      result = await sweepWelcomeFollowupIntents({
        client: intentClient([row]) as never,
        startWorkflow,
      });
    } finally {
      vi.useRealTimers();
    }

    expect(requestedAt.getTime()).toBeLessThan(now.getTime() - WELCOME_FOLLOWUP_MAX_AGE_MS);
    expect(result).toEqual({ dispatched: 0, expired: 1 });
    expect(row.welcomeFollowupExpiredAt).toEqual(now);
    expect(startWorkflow).not.toHaveBeenCalled();
    await expect(countExpiredWelcomeFollowupIntents(intentClient([row]) as never)).resolves.toBe(1);
  });

  it("does not start an intent that crosses the cutoff during a blocked workflow start", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const requestedAt = new Date(now.getTime() - WELCOME_FOLLOWUP_MAX_AGE_MS + 60_000);
    const rows: IntentRow[] = [
      {
        id: "user_first",
        welcomeFollowupExpiredAt: null,
        welcomeFollowupFinishedAt: null,
        welcomeFollowupRequestedAt: requestedAt,
        welcomeFollowupStartedAt: null,
      },
      {
        id: "user_second",
        welcomeFollowupExpiredAt: null,
        welcomeFollowupFinishedAt: null,
        welcomeFollowupRequestedAt: requestedAt,
        welcomeFollowupStartedAt: null,
      },
    ];
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const startWorkflow = vi.fn(async (userId: string) => {
      if (userId !== "user_first") return;
      firstStarted();
      await new Promise((resolve) => setTimeout(resolve, 2 * 60_000));
    });

    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const sweep = sweepWelcomeFollowupIntents({
        client: intentClient(rows) as never,
        limit: 2,
        startWorkflow,
      });
      await firstStartedPromise;
      await vi.advanceTimersByTimeAsync(2 * 60_000);
      await sweep;
    } finally {
      vi.useRealTimers();
    }

    expect(startWorkflow).toHaveBeenCalledTimes(1);
    expect(startWorkflow).toHaveBeenCalledWith("user_first");
    expect(rows[1].welcomeFollowupExpiredAt).toEqual(new Date(now.getTime() + 2 * 60_000));
  });

  it("expires an intent requested exactly seven days ago", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const row: IntentRow = {
      id: "user_boundary",
      welcomeFollowupExpiredAt: null,
      welcomeFollowupFinishedAt: null,
      welcomeFollowupRequestedAt: new Date(now.getTime() - WELCOME_FOLLOWUP_MAX_AGE_MS),
      welcomeFollowupStartedAt: null,
    };
    const startWorkflow = vi.fn(async () => undefined);

    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await expect(
        sweepWelcomeFollowupIntents({ client: intentClient([row]) as never, startWorkflow }),
      ).resolves.toEqual({ dispatched: 0, expired: 1 });
    } finally {
      vi.useRealTimers();
    }

    expect(row.welcomeFollowupExpiredAt).toEqual(now);
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it("does not reclaim an intent that was already started", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    const row: IntentRow = {
      id: "user_reclaimed",
      welcomeFollowupExpiredAt: null,
      welcomeFollowupFinishedAt: null,
      welcomeFollowupRequestedAt: new Date(now.getTime() - 60_000),
      welcomeFollowupStartedAt: new Date(now.getTime() - 6 * 60_000),
    };
    const startWorkflow = vi.fn(async () => undefined);

    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      await sweepWelcomeFollowupIntents({
        client: intentClient([row]) as never,
        limit: 1,
        startWorkflow,
      });
    } finally {
      vi.useRealTimers();
    }

    expect(startWorkflow).not.toHaveBeenCalled();
    expect(row.welcomeFollowupFinishedAt).toBeNull();
  });
});
