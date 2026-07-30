import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimQueuedPersistenceLease,
  QUEUED_PERSISTENCE_LEASE_MS,
  transitionQueuedPersistenceLease,
} from "./queued-persistence-lease";

const mocks = vi.hoisted(() => {
  const task = {
    persistenceLeaseExpiresAt: null as Date | null,
    persistenceLeaseOwner: null as string | null,
    state: "ready",
  };
  const databaseNow = new Date("2026-07-29T01:00:00.000Z");
  const prisma = {
    $queryRaw: vi.fn(async (query: { strings?: string[]; values?: unknown[] }) => {
      const sql = query.strings?.join("?") ?? "";
      const values = query.values ?? [];
      if (sql.includes("\"state\" = 'persisting'")) {
        const owner = String(values[1]);
        const taskId = values[2];
        const leaseMs = Number(values[0]);
        const claimable =
          taskId === "task_1" &&
          ((task.persistenceLeaseExpiresAt === null &&
            task.persistenceLeaseOwner === null &&
            ["provider_failed", "ready"].includes(task.state)) ||
            (task.persistenceLeaseExpiresAt !== null &&
              task.persistenceLeaseExpiresAt <= databaseNow &&
              task.persistenceLeaseOwner !== null &&
              task.state === "persisting"));
        if (!claimable) return [];
        task.persistenceLeaseExpiresAt = new Date(databaseNow.getTime() + leaseMs);
        task.persistenceLeaseOwner = owner;
        task.state = "persisting";
        return [{ expiresAt: task.persistenceLeaseExpiresAt }];
      }
      const hasError = sql.includes('"error" =');
      const nextState = String(values[0]);
      const taskId = values[hasError ? 2 : 1];
      const owner = values[hasError ? 3 : 2];
      const from = values.slice(hasError ? 4 : 3).map(String);
      const matches =
        taskId === "task_1" &&
        owner === task.persistenceLeaseOwner &&
        task.persistenceLeaseExpiresAt !== null &&
        task.persistenceLeaseExpiresAt > databaseNow &&
        from.includes(task.state);
      if (!matches) return [];
      task.state = nextState;
      task.persistenceLeaseOwner = null;
      task.persistenceLeaseExpiresAt = null;
      return [{ state: nextState }];
    }),
    queuedRankCheckTask: {
      findUniqueOrThrow: vi.fn(async () => ({ state: task.state })),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: {
            OR?: Array<Record<string, unknown>>;
            persistenceLeaseOwner?: string;
            state?: string | { in: string[] };
          };
        }) => {
          const stateMatches = (value: unknown) =>
            typeof value === "string"
              ? task.state === value
              : (value as { in?: string[] } | undefined)?.in?.includes(task.state) !== false;
          const clauseMatches = (clause: Record<string, unknown>) =>
            stateMatches(clause.state) &&
            (!("persistenceLeaseOwner" in clause) ||
              (clause.persistenceLeaseOwner !== null &&
              typeof clause.persistenceLeaseOwner === "object"
                ? task.persistenceLeaseOwner !== null
                : task.persistenceLeaseOwner === clause.persistenceLeaseOwner)) &&
            (!("persistenceLeaseExpiresAt" in clause) ||
              Boolean(
                task.persistenceLeaseExpiresAt &&
                  task.persistenceLeaseExpiresAt <=
                    (clause.persistenceLeaseExpiresAt as { lte: Date }).lte,
              ));
          const matches =
            stateMatches(where.state) &&
            (where.persistenceLeaseOwner === undefined ||
              task.persistenceLeaseOwner === where.persistenceLeaseOwner) &&
            (!where.OR || where.OR.some(clauseMatches));
          if (!matches) return { count: 0 };
          if ("state" in data) task.state = String(data.state);
          if ("persistenceLeaseOwner" in data) {
            task.persistenceLeaseOwner = data.persistenceLeaseOwner as string | null;
          }
          if ("persistenceLeaseExpiresAt" in data) {
            task.persistenceLeaseExpiresAt = data.persistenceLeaseExpiresAt as Date | null;
          }
          return { count: 1 };
        },
      ),
    },
  };
  return { prisma, task };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("queued persistence leases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.task.persistenceLeaseExpiresAt = null;
    mocks.task.persistenceLeaseOwner = null;
    mocks.task.state = "ready";
  });

  it("does not steal a live lease", async () => {
    const now = new Date("2026-07-29T01:00:00.000Z");
    mocks.task.persistenceLeaseExpiresAt = new Date(now.getTime() + 1);
    mocks.task.persistenceLeaseOwner = "current-owner";
    mocks.task.state = "persisting";

    await expect(claimQueuedPersistenceLease("task_1")).resolves.toBeNull();
    expect(mocks.task.persistenceLeaseOwner).toBe("current-owner");
  });

  it.each([
    ["release", "ready"],
    ["regression", "provider_failed"],
    ["terminalization", "failed"],
  ])("rejects expired-owner %s before any reclaim", async (_label, nextState) => {
    const expiredLease = {
      expiresAt: new Date("2026-07-29T00:59:59.999Z"),
      owner: "expired-owner",
      taskId: "task_1",
    };
    mocks.task.persistenceLeaseExpiresAt = expiredLease.expiresAt;
    mocks.task.persistenceLeaseOwner = expiredLease.owner;
    mocks.task.state = "persisting";

    await expect(
      transitionQueuedPersistenceLease(expiredLease, ["persisting"], { state: nextState }),
    ).resolves.toBe("persisting");

    expect(mocks.task.state).toBe("persisting");
    expect(mocks.task.persistenceLeaseOwner).toBe(expiredLease.owner);
    expect(mocks.task.persistenceLeaseExpiresAt).toEqual(expiredLease.expiresAt);
  });

  it("atomically reclaims expiry and rejects the former owner transition", async () => {
    const now = new Date("2026-07-29T01:00:00.000Z");
    const formerLease = {
      expiresAt: new Date(now.getTime() - 1),
      owner: "former-owner",
      taskId: "task_1",
    };
    mocks.task.persistenceLeaseExpiresAt = formerLease.expiresAt;
    mocks.task.persistenceLeaseOwner = formerLease.owner;
    mocks.task.state = "persisting";

    const reclaimed = await claimQueuedPersistenceLease("task_1");
    expect(reclaimed?.owner).not.toBe(formerLease.owner);
    expect(reclaimed?.expiresAt).toEqual(new Date(now.getTime() + QUEUED_PERSISTENCE_LEASE_MS));

    await expect(
      transitionQueuedPersistenceLease(formerLease, ["persisting"], { state: "failed" }),
    ).resolves.toBe("persisting");
    expect(mocks.task.persistenceLeaseOwner).toBe(reclaimed?.owner);

    if (!reclaimed) throw new Error("Expected an expired lease to be reclaimed.");
    await expect(
      transitionQueuedPersistenceLease(reclaimed, ["persisting"], { state: "ready" }),
    ).resolves.toBe("ready");
    expect(mocks.task.persistenceLeaseOwner).toBeNull();
    expect(mocks.task.persistenceLeaseExpiresAt).toBeNull();
  });
});
