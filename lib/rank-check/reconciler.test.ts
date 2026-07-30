import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ReconcileResult,
  type ReconcilerScheduleClient,
  reconcileAllSchedules,
} from "./reconciler";

const mocks = vi.hoisted(() => ({
  prisma: { keyword: { findMany: vi.fn() } },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

type KeywordRow = {
  id: string;
  projectId: string;
  project: {
    defaults: ScheduleShape | null;
    owner?: { deactivatedAt: Date | null };
    writeMode?: string;
  };
  schedule: ScheduleShape | null;
};
type ScheduleShape = {
  cronExpression: string | null;
  frequency: string;
  jitterMinutes: number;
  nextCheckAt?: Date | null;
  timezone: string;
};

function automatic(overrides: Partial<ScheduleShape> = {}): ScheduleShape {
  return {
    cronExpression: null,
    frequency: "daily",
    jitterMinutes: 60,
    timezone: "UTC",
    ...overrides,
  };
}

function clientMock(existingScheduleIds: string[] = []) {
  const handle = { delete: vi.fn(), update: vi.fn() };
  async function* list() {
    for (const scheduleId of existingScheduleIds) {
      yield { scheduleId };
    }
  }
  const client = {
    create: vi.fn(),
    getHandle: vi.fn(() => handle),
    list: vi.fn(() => list()),
  } as unknown as ReconcilerScheduleClient;

  return { client, handle };
}

function setKeywords(rows: KeywordRow[]) {
  mocks.prisma.keyword.findMany.mockResolvedValue(
    rows.map((row) => ({
      ...row,
      project: {
        ...row.project,
        owner: row.project.owner ?? { deactivatedAt: null },
      },
    })),
  );
}

describe("reconcileAllSchedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(["cutover", "dispatcher"] as const)(
    "does no database or Temporal work in %s mode",
    async (mode) => {
      vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
      const { client } = clientMock(["rank-check-k1"]);

      await expect(reconcileAllSchedules(client)).resolves.toEqual({
        created: 0,
        deleted: 0,
        failed: 0,
        listed: 0,
        scanned: 0,
        updated: 0,
      });
      expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
      expect(client.list).not.toHaveBeenCalled();
    },
  );

  it("creates Temporal schedules for automatic keywords and counts them", async () => {
    setKeywords([
      { id: "k1", projectId: "p1", project: { defaults: null }, schedule: automatic() },
      {
        id: "k2",
        projectId: "p1",
        project: { defaults: automatic({ frequency: "weekly" }) },
        schedule: null,
      },
    ]);
    const { client } = clientMock();

    const result = await reconcileAllSchedules(client);

    expect(client.create).toHaveBeenCalledTimes(2);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: "rank-check-k1" }),
    );
    expect(result).toMatchObject<Partial<ReconcileResult>>({
      created: 2,
      deleted: 0,
      failed: 0,
      scanned: 2,
    });
  });

  it("keeps inherited and explicit monthly wall-clock anchors during reconciliation", async () => {
    setKeywords([
      {
        id: "inherited",
        projectId: "p1",
        project: {
          defaults: automatic({
            frequency: "monthly",
            nextCheckAt: new Date("2026-02-15T06:00:00.000Z"),
          }),
        },
        schedule: null,
      },
      {
        id: "explicit",
        projectId: "p1",
        project: {
          defaults: automatic({
            frequency: "monthly",
            nextCheckAt: new Date("2026-02-15T06:00:00.000Z"),
          }),
        },
        schedule: automatic({
          frequency: "monthly",
          nextCheckAt: new Date("2026-02-20T09:45:00.000Z"),
        }),
      },
    ]);
    const { client } = clientMock();

    await reconcileAllSchedules(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: "rank-check-inherited",
        spec: expect.objectContaining({ cronExpressions: ["0 6 15 * *"] }),
      }),
    );
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: "rank-check-explicit",
        spec: expect.objectContaining({ cronExpressions: ["45 9 20 * *"] }),
      }),
    );
  });

  it("does not create schedules for manual, paused, or intentless keywords", async () => {
    setKeywords([
      {
        id: "k1",
        projectId: "p1",
        project: { defaults: null },
        schedule: automatic({ frequency: "manual" }),
      },
      {
        id: "k2",
        projectId: "p1",
        project: { defaults: null },
        schedule: automatic({ frequency: "paused" }),
      },
      { id: "k3", projectId: "p1", project: { defaults: null }, schedule: null },
    ]);
    const { client } = clientMock();

    const result = await reconcileAllSchedules(client);

    expect(client.create).not.toHaveBeenCalled();
    expect(result.scanned).toBe(3);
    expect(result.created).toBe(0);
  });

  it("does not create schedules for projects in migration hold", async () => {
    setKeywords([
      {
        id: "k1",
        projectId: "p1",
        project: { defaults: automatic(), writeMode: "migration_hold" },
        schedule: null,
      },
    ]);
    const { client } = clientMock();

    const result = await reconcileAllSchedules(client);

    expect(client.create).not.toHaveBeenCalled();
    expect(result.scanned).toBe(1);
    expect(result.created).toBe(0);
  });

  it("prunes schedules when the project owner is deactivated", async () => {
    setKeywords([
      {
        id: "k1",
        projectId: "p1",
        project: {
          defaults: null,
          owner: { deactivatedAt: new Date("2026-07-18T00:30:00.000Z") },
        },
        schedule: automatic(),
      },
    ]);
    const { client, handle } = clientMock(["rank-check-k1"]);

    const result = await reconcileAllSchedules(client);

    expect(client.create).not.toHaveBeenCalled();
    expect(client.getHandle).toHaveBeenCalledWith("rank-check-k1");
    expect(handle.delete).toHaveBeenCalledOnce();
    expect(result).toMatchObject<Partial<ReconcileResult>>({ deleted: 1, scanned: 1 });
  });

  it("recreates schedules after the project owner is reactivated", async () => {
    setKeywords([
      {
        id: "k1",
        projectId: "p1",
        project: { defaults: null, owner: { deactivatedAt: null } },
        schedule: automatic(),
      },
    ]);
    const { client } = clientMock();

    const result = await reconcileAllSchedules(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: "rank-check-k1" }),
    );
    expect(result).toMatchObject<Partial<ReconcileResult>>({ created: 1, scanned: 1 });
  });

  it("prunes orphaned rank-check schedules but preserves the reconciler singleton", async () => {
    setKeywords([
      { id: "k1", projectId: "p1", project: { defaults: null }, schedule: automatic() },
    ]);
    // k1 is desired; orphan-k9 (manual/deleted keyword) must be pruned; the
    // reconciler singleton and unrelated ids must be left untouched.
    const { client, handle } = clientMock([
      "rank-check-k1",
      "rank-check-orphan-k9",
      "rank-check-reconciler",
      "other-schedule",
    ]);

    const result = await reconcileAllSchedules(client);

    expect(handle.delete).toHaveBeenCalledTimes(1);
    expect(client.getHandle).toHaveBeenCalledWith("rank-check-orphan-k9");
    expect(result).toMatchObject<Partial<ReconcileResult>>({ deleted: 1, listed: 3 });
  });

  it("counts non-fatal sync failures without throwing", async () => {
    setKeywords([
      { id: "k1", projectId: "p1", project: { defaults: null }, schedule: automatic() },
    ]);
    const { client } = clientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(client.create).mockRejectedValue(new Error("Temporal unavailable"));

    const result = await reconcileAllSchedules(client);

    expect(result.failed).toBe(1);
    expect(result.created).toBe(0);
    consoleError.mockRestore();
  });

  it("treats a present manual keyword schedule as a prune target", async () => {
    setKeywords([
      {
        id: "k1",
        projectId: "p1",
        project: { defaults: null },
        schedule: automatic({ frequency: "manual" }),
      },
    ]);
    const { client, handle } = clientMock(["rank-check-k1"]);

    const result = await reconcileAllSchedules(client);

    expect(client.create).not.toHaveBeenCalled();
    expect(handle.delete).toHaveBeenCalledTimes(1);
    expect(result.deleted).toBe(1);
  });
});
