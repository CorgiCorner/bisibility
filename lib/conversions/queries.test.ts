import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trailingPeriod } from "./dates";
import {
  getConversionPageTotals,
  getConversionSeries,
  getConversionSources,
  getConversionsSettings,
  getConversionTotals,
} from "./queries";
import { conversionCatalogSources } from "./sources";
import type { ConversionFact, ConversionGoalRef } from "./summarize";
import { summarizeGoals } from "./summarize";

const day = new Date("2026-03-28T00:00:00.000Z");
const period = { from: day, to: day };

const goals = [
  {
    countsRevenue: false,
    displayName: "Key events",
    enabled: true,
    id: "goal_ga4",
    source: "ga4",
    sourceName: "key_events",
  },
  {
    countsRevenue: true,
    displayName: "Sign up",
    enabled: false,
    id: "goal_signup",
    source: "plausible",
    sourceName: "Signup",
  },
  {
    countsRevenue: true,
    displayName: "Trial",
    enabled: true,
    id: "goal_trial",
    source: "plausible",
    sourceName: "Trial started",
  },
];

const facts = [
  {
    count: 4,
    currency: null,
    date: day,
    name: "key_events",
    path: "/pricing",
    revenueMinor: null,
    source: "ga4",
  },
  {
    count: 9,
    currency: "USD",
    date: day,
    name: "Signup",
    path: "/pricing",
    revenueMinor: 100n,
    source: "plausible",
  },
  {
    count: 2,
    currency: "USD",
    date: day,
    name: "Trial started",
    path: "/pricing",
    revenueMinor: 50n,
    source: "plausible",
  },
  {
    count: 1,
    currency: "EUR",
    date: day,
    name: "Trial started",
    path: "/docs",
    revenueMinor: 25n,
    source: "plausible",
  },
];

function pairsOf(where: { OR?: { name: string; source: string }[] }) {
  return where.OR ?? [];
}

const { prisma, primaryRef } = vi.hoisted(() => {
  const primaryRef = { value: "ga4" as string | null };
  const prisma = {
    conversionDaily: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { OR?: { name: string; source: string }[]; revenueMinor?: { not: null } };
        }) => {
          if (where.revenueMinor) {
            const seen = new Set<string>();
            return facts.flatMap((row) => {
              if (row.revenueMinor == null) return [];
              const key = `${row.source}:${row.name}`;
              if (seen.has(key)) return [];
              seen.add(key);
              return [{ name: row.name, source: row.source }];
            });
          }
          const pairs = pairsOf(where);
          return facts.filter((row) =>
            pairs.some((pair) => pair.source === row.source && pair.name === row.name),
          );
        },
      ),
      groupBy: vi.fn(
        async ({
          by,
          where,
        }: {
          by: string[];
          where: { OR?: { name: string; source: string }[] };
        }) => {
          const pairs = pairsOf(where);
          const matched = facts.filter((row) =>
            pairs.some((pair) => pair.source === row.source && pair.name === row.name),
          );
          if (by.includes("name")) {
            const grouped = new Map<string, number>();
            for (const row of matched) {
              const key = `${row.source}:${row.name}`;
              grouped.set(key, (grouped.get(key) ?? 0) + row.count);
            }
            return [...grouped.entries()].map(([key, count]) => {
              const [source, name] = key.split(":");
              return { _sum: { count }, name, source };
            });
          }
          const grouped = new Map<string, { count: number; date: Date }>();
          for (const row of matched) {
            const current = grouped.get(row.source) ?? { count: 0, date: row.date };
            current.count += row.count;
            grouped.set(row.source, current);
          }
          return [...grouped.entries()].map(([source, value]) => ({
            _max: { date: value.date },
            _sum: { count: value.count },
            source,
          }));
        },
      ),
    },
    conversionGoal: {
      findMany: vi.fn(async ({ where }: { where?: { source?: string } }) =>
        goals.filter((goal) => !where?.source || goal.source === where.source),
      ),
    },
    projectDefaults: {
      findUnique: vi.fn(async () => ({ primaryConversionSource: primaryRef.value })),
    },
    providerConnection: {
      findMany: vi.fn(async () => [
        { enabled: true, provider: "ga4", status: "connected" },
        { enabled: true, provider: "plausible", status: "connected" },
      ]),
    },
  };
  return { primaryRef, prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma }));

describe("conversion queries", () => {
  beforeEach(() => {
    primaryRef.value = "ga4";
    vi.clearAllMocks();
  });

  it("lists only GA4 and Plausible from the analytics catalog", () => {
    expect(conversionCatalogSources().map((source) => source.source)).toEqual(["ga4", "plausible"]);
  });

  it("uses 28 inclusive UTC days", () => {
    expect(trailingPeriod(new Date("2026-03-28T15:00:00.000Z"), 28)).toEqual({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-28T00:00:00.000Z"),
    });
  });

  it("excludes disabled goals and returns display names", async () => {
    const totals = await getConversionTotals("project_1", period);
    expect(totals).toEqual([
      {
        goals: [{ count: 4, currency: null, displayName: "Key events", revenueMinor: null }],
        source: "ga4",
        totalCount: 4,
      },
      {
        goals: [{ count: 3, currency: null, displayName: "Trial", revenueMinor: null }],
        source: "plausible",
        totalCount: 3,
      },
    ]);
    const queried = prisma.conversionDaily.findMany.mock.calls.flatMap(([input]) => {
      const pairs = (input as { where: { OR?: { name: string }[] } }).where.OR;
      return pairs ?? [];
    });
    expect(queried.map((pair) => pair.name)).not.toContain("Signup");
  });

  it("defaults page totals to the primary source and accepts another source", async () => {
    await expect(getConversionPageTotals("project_1", period)).resolves.toMatchObject({
      pages: [{ path: "/pricing", totalCount: 4 }],
      source: "ga4",
    });
    await expect(getConversionPageTotals("project_1", period, "plausible")).resolves.toMatchObject({
      source: "plausible",
    });
    primaryRef.value = null;
    await expect(getConversionPageTotals("project_1", period)).resolves.toEqual({
      pages: [],
      source: null,
    });
  });

  it("fills a daily series for the selected source", async () => {
    const series = await getConversionSeries(
      "project_1",
      { from: new Date("2026-03-27T00:00:00.000Z"), to: day },
      "ga4",
    );
    expect(series.points.map((point) => point.date)).toEqual(["2026-03-27", "2026-03-28"]);
    expect(series.points[0]?.totalCount).toBe(0);
    expect(series.points[1]?.goals[0]?.displayName).toBe("Key events");
    expect(series.points[1]?.totalCount).toBe(4);
  });

  it("treats a missing conversions table as no sources", async () => {
    prisma.conversionGoal.findMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("The table does not exist", {
        clientVersion: "7.9.1",
        code: "P2021",
      }),
    );
    await expect(getConversionSources("project_1", day)).resolves.toEqual([]);
  });

  it("reports connected sources without counting disabled goals", async () => {
    const sources = await getConversionSources("project_1", day);
    expect(sources).toEqual([
      expect.objectContaining({
        connected: true,
        conversions28: 4,
        lastDay: "2026-03-28",
        primary: true,
        source: "ga4",
      }),
      expect.objectContaining({
        connected: true,
        conversions28: 3,
        lastDay: "2026-03-28",
        primary: false,
        source: "plausible",
      }),
    ]);
  });

  it("keeps a disabled goal in settings and hides the side-by-side name", async () => {
    const model = await getConversionsSettings("project_1", day);
    expect(model.showComparison).toBe(true);
    expect(model.goals.map((goal) => [goal.displayName, goal.last28, goal.enabled])).toEqual([
      ["Key events", 4, true],
      ["Sign up", 9, false],
      ["Trial", 3, true],
    ]);
    expect(model.comparison.map((row) => row.displayName)).toEqual(["Key events", "Trial"]);
    expect(model.goals.map((goal) => [goal.sourceName, goal.reportsRevenue])).toEqual([
      ["key_events", false],
      ["Signup", true],
      ["Trial started", true],
    ]);
    expect(model.sources.map((source) => [source.source, source.reportsRevenue])).toEqual([
      ["ga4", false],
      ["plausible", true],
    ]);
  });
});

describe("summarizeGoals", () => {
  const trial: ConversionGoalRef = {
    countsRevenue: true,
    displayName: "Trial",
    enabled: true,
    source: "plausible",
    sourceName: "Trial started",
  };

  function row(currency: string, revenueMinor: bigint): ConversionFact {
    return {
      count: 1,
      currency,
      date: day,
      name: "Trial started",
      path: "/pricing",
      revenueMinor,
      source: "plausible",
    };
  }

  it("sums one currency and drops mixed currencies", () => {
    expect(summarizeGoals([trial], [row("USD", 50n), row("USD", 25n)])).toEqual([
      { count: 2, currency: "USD", displayName: "Trial", revenueMinor: "75" },
    ]);
    expect(summarizeGoals([trial], [row("USD", 50n), row("EUR", 25n)])[0]?.revenueMinor).toBeNull();
  });
});
