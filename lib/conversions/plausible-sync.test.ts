import { pagePathHash } from "@/lib/pages/page-path";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aggregatePlausibleGoals, plausibleDailyWrite } from "./plausible-rows";
import { plausibleSyncWindow, syncPlausibleConversions } from "./plausible-sync";

type DailyRow = {
  count: number;
  currency: string | null;
  date: Date;
  id: string;
  name: string;
  path: string;
  pathHash: string;
  projectId: string;
  revenueMinor: bigint | null;
  source: string;
};

type GoalRow = {
  countsRevenue: boolean;
  displayName: string;
  enabled: boolean;
  firstSeen: Date;
  id: string;
  lastSeen: Date;
  projectId: string;
  source: string;
  sourceName: string;
};

const { daily, fetchGoals, goals, prisma } = vi.hoisted(() => {
  const daily: DailyRow[] = [];
  const goals: GoalRow[] = [];
  let nextId = 0;
  const nextIdentity = (prefix: string) => {
    nextId += 1;
    return `${prefix}_${nextId}`;
  };
  const inWindow = (
    row: DailyRow,
    where: { date?: { gte?: Date; lte?: Date }; projectId?: string; source?: string },
  ) => {
    if (where.projectId && row.projectId !== where.projectId) return false;
    if (where.source && row.source !== where.source) return false;
    if (where.date?.gte && row.date.getTime() < where.date.gte.getTime()) return false;
    if (where.date?.lte && row.date.getTime() > where.date.lte.getTime()) return false;
    return true;
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<void>) => callback(prisma)),
    conversionDaily: {
      aggregate: vi.fn(async ({ where }: { where: { projectId: string; source: string } }) => {
        const dates = daily
          .filter((row) => row.projectId === where.projectId && row.source === where.source)
          .map((row) => row.date.getTime());
        return { _max: { date: dates.length > 0 ? new Date(Math.max(...dates)) : null } };
      }),
      createMany: vi.fn(async ({ data }: { data: Omit<DailyRow, "id">[] }) => {
        for (const row of data) daily.push({ ...row, id: nextIdentity("daily") });
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in);
        for (let index = daily.length - 1; index >= 0; index -= 1) {
          const row = daily[index];
          if (row && ids.has(row.id)) daily.splice(index, 1);
        }
      }),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { date?: { gte?: Date; lte?: Date }; projectId?: string; source?: string };
        }) => daily.filter((row) => inWindow(row, where)).map((row) => ({ ...row })),
      ),
      update: vi.fn(async ({ data, where }: { data: Partial<DailyRow>; where: { id: string } }) => {
        const row = daily.find((item) => item.id === where.id);
        if (row) Object.assign(row, data);
      }),
    },
    conversionGoal: {
      create: vi.fn(async ({ data }: { data: Omit<GoalRow, "id"> }) => {
        goals.push({ ...data, id: nextIdentity("goal") });
      }),
      findMany: vi.fn(async ({ where }: { where: { sourceName: { in: string[] } } }) =>
        goals
          .filter((goal) => where.sourceName.in.includes(goal.sourceName))
          .map((goal) => ({ ...goal })),
      ),
      update: vi.fn(async ({ data, where }: { data: Partial<GoalRow>; where: { id: string } }) => {
        const goal = goals.find((item) => item.id === where.id);
        if (goal) Object.assign(goal, data);
      }),
    },
    project: { findUnique: vi.fn(async () => ({ domain: "example.com" })) },
    providerConnection: {
      findUnique: vi.fn(async () => ({
        credentialsEncrypted: "encrypted",
        enabled: true,
        id: "conn_plausible",
        kind: "analytics",
        provider: "plausible",
        status: "connected",
      })),
    },
  };
  return { daily, fetchGoals: vi.fn(), goals, prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma }));
vi.mock("@/lib/traffic/runtime-credentials", () => ({
  trafficRuntimeCredentials: () => ({ apiKey: "stats-token", login: "example.com" }),
}));
vi.mock("@/lib/providers/analytics/plausible-goals", () => ({
  fetchPlausibleGoalConversions: fetchGoals,
  PlausibleGoalParseError: class PlausibleGoalParseError extends Error {
    constructor() {
      super("Plausible goal query returned an unexpected body.");
      this.name = "PlausibleGoalParseError";
    }
  },
}));

const signup = {
  date: "2026-03-01",
  entryPage: "/pricing/",
  events: 2,
  goal: "Signup",
  revenue: { currency: "USD", minor: 1250n },
};

function fetched(
  rows = [
    signup,
    {
      ...signup,
      entryPage: "https://www.example.com/pricing",
      events: 1,
      revenue: { currency: "USD", minor: 100n },
    },
    { ...signup, entryPage: "https://other.example.org/out", events: 9, revenue: null },
  ],
) {
  return { revenueSupported: true, rows, truncated: false };
}

describe("plausible goal rows", () => {
  it("normalizes landing paths and sums one goal for the day", () => {
    const rows = aggregatePlausibleGoals("example.com", fetched().rows);
    expect(rows).toEqual([
      {
        count: 3,
        currency: "USD",
        date: new Date("2026-03-01T00:00:00.000Z"),
        name: "Signup",
        path: "/pricing",
        pathHash: pagePathHash("/pricing"),
        revenueMinor: 1350n,
      },
    ]);
    expect(rows[0]).not.toHaveProperty("visitors");
  });

  it("writes the same daily shape the review seed stores", () => {
    const now = new Date("2026-03-02T00:00:00.000Z");
    expect(
      plausibleDailyWrite({
        count: 2,
        createdAt: now,
        currency: null,
        date: new Date("2026-03-01T15:00:00.000Z"),
        name: "Signup",
        path: "/pricing",
        pathHash: "hash",
        projectId: "project_1",
        revenueMinor: null,
        updatedAt: now,
      }),
    ).toMatchObject({
      currency: null,
      date: new Date("2026-03-01T00:00:00.000Z"),
      revenueMinor: null,
      source: "plausible",
    });
  });
});

describe("plausible sync window", () => {
  const now = new Date("2026-03-28T18:00:00.000Z");

  it("uses 35 days on the first run and then the last stored day minus two", () => {
    expect(plausibleSyncWindow(now, null)).toEqual({
      from: "2026-02-22",
      to: "2026-03-28",
      truncated: false,
    });
    expect(plausibleSyncWindow(now, new Date("2026-03-20T00:00:00.000Z"))).toEqual({
      from: "2026-03-18",
      to: "2026-03-28",
      truncated: false,
    });
  });

  it("caps a run at 90 days and reports the remainder as truncated", () => {
    expect(
      plausibleSyncWindow(
        new Date("2026-06-01T00:00:00.000Z"),
        new Date("2025-01-01T00:00:00.000Z"),
      ),
    ).toEqual({
      from: "2024-12-30",
      to: "2025-03-29",
      truncated: true,
    });
  });
});

describe("syncPlausibleConversions", () => {
  beforeEach(() => {
    daily.length = 0;
    goals.length = 0;
    vi.clearAllMocks();
    fetchGoals.mockResolvedValue(fetched());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("upserts daily counts and goals, then changes nothing on the next run", async () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    const first = await syncPlausibleConversions("project_1", { now });
    expect(first).toMatchObject({ created: 1, deleted: 0, goals: 1, ok: true, updated: 0 });
    expect(fetchGoals).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "stats-token" }), {
      endDate: "2026-03-28",
      startDate: "2026-02-22",
    });
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({
      count: 3,
      name: "Signup",
      path: "/pricing",
      source: "plausible",
    });
    expect(goals[0]).toMatchObject({
      displayName: "Signup",
      firstSeen: new Date("2026-03-01T00:00:00.000Z"),
      lastSeen: new Date("2026-03-01T00:00:00.000Z"),
      sourceName: "Signup",
    });
    const snapshot = daily.map((row) => ({
      ...row,
      revenueMinor: row.revenueMinor?.toString() ?? null,
    }));
    const second = await syncPlausibleConversions("project_1", { now });
    expect(second).toMatchObject({ created: 0, deleted: 0, goals: 0, ok: true, updated: 0 });
    expect(
      daily.map((row) => ({ ...row, revenueMinor: row.revenueMinor?.toString() ?? null })),
    ).toEqual(snapshot);
    expect(goals[0]?.displayName).toBe("Signup");
  });

  it("keeps a renamed goal and extends last seen", async () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    await syncPlausibleConversions("project_1", { now });
    const goal = goals[0];
    if (!goal) throw new Error("missing goal");
    goal.displayName = "Signups";
    fetchGoals.mockResolvedValue(
      fetched([{ ...signup, date: "2026-03-20", entryPage: "/pricing", events: 1, revenue: null }]),
    );
    await syncPlausibleConversions("project_1", { now });
    expect(goal.displayName).toBe("Signups");
    expect(goal.lastSeen).toEqual(new Date("2026-03-20T00:00:00.000Z"));
  });

  it("reads the next window from the last stored day", async () => {
    daily.push({
      count: 1,
      currency: null,
      date: new Date("2026-03-20T00:00:00.000Z"),
      id: "daily_seed",
      name: "Signup",
      path: "/pricing",
      pathHash: pagePathHash("/pricing"),
      projectId: "project_1",
      revenueMinor: null,
      source: "plausible",
    });
    fetchGoals.mockResolvedValue(fetched([]));
    await syncPlausibleConversions("project_1", { now: new Date("2026-03-28T00:00:00.000Z") });
    expect(fetchGoals).toHaveBeenCalledWith(expect.any(Object), {
      endDate: "2026-03-28",
      startDate: "2026-03-18",
    });
  });

  it("does not delete rows outside a truncated page", async () => {
    const now = new Date("2026-03-28T00:00:00.000Z");
    daily.push({
      count: 4,
      currency: null,
      date: new Date("2026-03-01T00:00:00.000Z"),
      id: "daily_stale",
      name: "Trial started",
      path: "/docs",
      pathHash: pagePathHash("/docs"),
      projectId: "project_1",
      revenueMinor: null,
      source: "plausible",
    });
    fetchGoals.mockResolvedValue({ ...fetched(), truncated: true });
    const result = await syncPlausibleConversions("project_1", { now });
    expect(result.truncated).toBe(true);
    expect(daily.some((row) => row.id === "daily_stale")).toBe(true);
  });

  it("returns a typed failure and leaves stored rows intact", async () => {
    daily.push({
      count: 4,
      currency: null,
      date: new Date("2026-03-01T00:00:00.000Z"),
      id: "daily_kept",
      name: "Signup",
      path: "/pricing",
      pathHash: pagePathHash("/pricing"),
      projectId: "project_1",
      revenueMinor: null,
      source: "plausible",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchGoals.mockRejectedValue(new ProviderAuthError("plausible"));
    await expect(syncPlausibleConversions("project_1")).resolves.toMatchObject({
      error: "auth",
      ok: false,
    });
    fetchGoals.mockRejectedValue(new Error("stats-token leaked"));
    await expect(syncPlausibleConversions("project_1")).resolves.toMatchObject({
      error: "provider",
      ok: false,
    });
    expect(daily).toHaveLength(1);
    expect(daily[0]?.count).toBe(4);
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("stats-token");
    errorSpy.mockRestore();
  });

  it("skips a scheduled run while maintenance is disabled", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    await expect(syncPlausibleConversions("project_1", { scheduled: true })).resolves.toMatchObject(
      { ok: true, skipped: "maintenance" },
    );
    expect(fetchGoals).not.toHaveBeenCalled();
  });

  it("reports a missing connection without calling the provider", async () => {
    prisma.providerConnection.findUnique.mockResolvedValueOnce({
      credentialsEncrypted: "encrypted",
      enabled: true,
      id: "conn_plausible",
      kind: "analytics",
      provider: "plausible",
      status: "needs_reauth",
    });
    await expect(syncPlausibleConversions("project_1")).resolves.toMatchObject({
      error: "not_connected",
      ok: false,
    });
    expect(fetchGoals).not.toHaveBeenCalled();
  });
});
