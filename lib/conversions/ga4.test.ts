import { pagePathForProject, pagePathHash } from "@/lib/pages/page-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aggregateGa4KeyEvents, projectGa4KeyEvents } from "./ga4";
import { GA4_KEY_EVENTS_DISPLAY_NAME, GA4_KEY_EVENTS_NAME } from "./types";

type DailyRow = {
  count: number;
  date: Date;
  id: string;
  name: string;
  path: string;
  pathHash: string;
  projectId: string;
  source: string;
};

type GoalRow = {
  displayName: string;
  firstSeen: Date;
  id: string;
  lastSeen: Date;
  projectId: string;
  source: string;
  sourceName: string;
};

const day = new Date("2026-03-01T00:00:00.000Z");
const earlier = new Date("2026-02-01T00:00:00.000Z");

const { daily, goals, prisma } = vi.hoisted(() => {
  const daily: DailyRow[] = [];
  const goals: GoalRow[] = [];
  let nextId = 0;
  const nextIdentity = (prefix: string) => {
    nextId += 1;
    return `${prefix}_${nextId}`;
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<void>) => callback(prisma)),
    conversionDaily: {
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
      findMany: vi.fn(async () => daily.map((row) => ({ ...row }))),
      update: vi.fn(async ({ data, where }: { data: Partial<DailyRow>; where: { id: string } }) => {
        const row = daily.find((item) => item.id === where.id);
        if (row) Object.assign(row, data);
      }),
    },
    conversionGoal: {
      create: vi.fn(async ({ data }: { data: Omit<GoalRow, "id"> }) => {
        goals.push({ ...data, id: nextIdentity("goal") });
      }),
      findUnique: vi.fn(async () => (goals[0] ? { ...goals[0] } : null)),
      update: vi.fn(async ({ data, where }: { data: Partial<GoalRow>; where: { id: string } }) => {
        const goal = goals.find((item) => item.id === where.id);
        if (goal) Object.assign(goal, data);
      }),
    },
    organicSessionsPageDaily: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
  };
  return { daily, goals, prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma }));

const organic = [
  { date: day, keyEvents: 4, path: "/pricing/" },
  { date: day, keyEvents: 1, path: "https://www.example.com/pricing" },
  { date: day, keyEvents: 0, path: "/pricing" },
  { date: day, keyEvents: 9, path: "https://other.example.org/pricing" },
  { date: earlier, keyEvents: 2, path: "/docs" },
];

describe("projectGa4KeyEvents", () => {
  beforeEach(() => {
    daily.splice(0);
    goals.splice(0);
    vi.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue({ domain: "example.com" });
    prisma.organicSessionsPageDaily.findMany.mockResolvedValue(organic);
  });

  it("projects one key-events row per canonical page and day, then changes nothing", async () => {
    await projectGa4KeyEvents("project_1");
    const pricing = pagePathForProject("example.com", "/pricing/");
    expect(pricing).toBe("/pricing");
    expect(daily).toEqual([
      expect.objectContaining({
        count: 5,
        name: GA4_KEY_EVENTS_NAME,
        path: "/pricing",
        pathHash: pagePathHash("/pricing"),
        source: "ga4",
      }),
      expect.objectContaining({
        count: 2,
        name: GA4_KEY_EVENTS_NAME,
        path: "/docs",
        source: "ga4",
      }),
    ]);
    expect(goals).toEqual([
      expect.objectContaining({
        displayName: GA4_KEY_EVENTS_DISPLAY_NAME,
        firstSeen: earlier,
        lastSeen: day,
        sourceName: GA4_KEY_EVENTS_NAME,
      }),
    ]);

    vi.clearAllMocks();
    prisma.organicSessionsPageDaily.findMany.mockResolvedValue(organic);
    await projectGa4KeyEvents("project_1");
    expect(prisma.conversionDaily.createMany).not.toHaveBeenCalled();
    expect(prisma.conversionDaily.update).not.toHaveBeenCalled();
    expect(prisma.conversionDaily.deleteMany).not.toHaveBeenCalled();
    expect(prisma.conversionGoal.create).not.toHaveBeenCalled();
    expect(prisma.conversionGoal.update).not.toHaveBeenCalled();
    expect(daily).toHaveLength(2);
  });

  it("keeps a renamed goal and only expands the seen range", async () => {
    await projectGa4KeyEvents("project_1");
    const goal = goals[0];
    if (!goal) throw new Error("missing goal");
    goal.displayName = "Purchases";
    vi.clearAllMocks();
    prisma.organicSessionsPageDaily.findMany.mockResolvedValue([
      { date: new Date("2026-01-15T00:00:00.000Z"), keyEvents: 3, path: "/pricing" },
    ]);
    await projectGa4KeyEvents("project_1");
    expect(goal.displayName).toBe("Purchases");
    expect(prisma.conversionGoal.update).toHaveBeenCalledWith({
      data: {
        firstSeen: new Date("2026-01-15T00:00:00.000Z"),
        lastSeen: day,
      },
      where: { id: goal.id },
    });
  });

  it("does not write without a project domain", async () => {
    prisma.project.findUnique.mockResolvedValue({ domain: null });
    await expect(projectGa4KeyEvents("project_1")).resolves.toEqual({
      created: 0,
      deleted: 0,
      updated: 0,
    });
    expect(prisma.conversionDaily.createMany).not.toHaveBeenCalled();
  });
});

describe("aggregateGa4KeyEvents", () => {
  it("drops a foreign host and a zero count", () => {
    expect(
      aggregateGa4KeyEvents("example.com", organic)
        .map((row) => row.path)
        .sort(),
    ).toEqual(["/docs", "/pricing"]);
  });
});
