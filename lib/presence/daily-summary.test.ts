import { beforeEach, expect, it, vi } from "vitest";
import { persistIndexingDay } from "./daily-summary";
import { projectDay } from "./project-day";

const state = vi.hoisted(() => ({
  defaults: vi.fn(),
  rows: vi.fn(),
  count: vi.fn(),
  changes: vi.fn(),
  upsert: vi.fn(),
  find: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("@/lib/search-index/current-rows", () => ({
  currentPageIndexingScope: state.scope,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: vi.fn(),
        projectDefaults: { findUnique: state.defaults },
        urlPresence: { findMany: state.rows },
        urlPresenceChange: { count: state.count, findMany: state.changes },
        pageIndexingDay: { findUnique: state.find, upsert: state.upsert },
      }),
  },
}));
const now = new Date("2026-10-25T12:00:00Z");
const input = { projectId: "p", property: "sc-domain:example.com", now, stop: null };
const stored = new Map<string, Record<string, unknown>>();
beforeEach(() => {
  vi.resetAllMocks();
  stored.clear();
  state.defaults.mockResolvedValue({ timezone: "Europe/Warsaw" });
  state.scope.mockResolvedValue({ where: { projectId: "p" } });
  state.rows.mockResolvedValue([
    { checkedAt: now, inspectionFailedAt: null, inspectionError: null, verdict: "PASS" },
    { checkedAt: new Date(0), inspectionFailedAt: null, inspectionError: null, verdict: "FAIL" },
    { checkedAt: now, inspectionFailedAt: now, inspectionError: "failed", verdict: "PASS" },
    { checkedAt: null, inspectionFailedAt: null, inspectionError: null, verdict: null },
  ]);
  state.count.mockResolvedValue(8);
  state.changes.mockResolvedValue(
    Array.from({ length: 5 }, (_, i) => ({
      url: `https://example.com/${i}`,
      previous: { coverageState: "Indexed" },
      next: { coverageState: "Not found (404)" },
    })),
  );
  state.find.mockImplementation(async ({ where }) => stored.get(where.projectId_date.date) ?? null);
  state.upsert.mockImplementation(async ({ where, create, update }) => {
    const key = where.projectId_date.date;
    stored.set(key, stored.has(key) ? { ...stored.get(key), ...update } : create);
  });
});
it("upserts two runs into one day, preserving the full change count and five transitions", async () => {
  await persistIndexingDay(input);
  state.rows.mockResolvedValue([]);
  await persistIndexingDay({ ...input, now: new Date(now.getTime() + 1000) });
  expect(stored.size).toBe(1);
  expect(state.upsert.mock.calls[0][0].create).toMatchObject({
    date: "2026-10-25",
    indexed: 1,
    notIndexed: 1,
    failed: 1,
    checked: 3,
    total: 4,
    inspectedThatDay: 2,
    changes: {
      count: 8,
      entries: expect.arrayContaining([
        { url: "https://example.com/0", previous: "Indexed", next: "Not found (404)" },
      ]),
    },
  });
  expect(stored.get("2026-10-25")).toMatchObject({ total: 0 });
  expect(
    (stored.get("2026-10-25")?.changes as { entries: unknown[] } | undefined)?.entries,
  ).toHaveLength(5);
  expect(state.changes).toHaveBeenCalledWith(
    expect.objectContaining({
      take: 5,
      where: expect.objectContaining({ previous: expect.anything() }),
    }),
  );
});
it.each([
  ["Europe/Warsaw", "2026-10-24T21:59:59Z", "2026-10-24T22:00:00Z", "2026-10-24", "2026-10-25"],
  ["Europe/Warsaw", "2026-10-25T22:59:59Z", "2026-10-25T23:00:00Z", "2026-10-25", "2026-10-26"],
  [
    "America/Los_Angeles",
    "2026-10-25T06:59:59Z",
    "2026-10-25T07:00:00Z",
    "2026-10-24",
    "2026-10-25",
  ],
  [
    "America/Los_Angeles",
    "2026-11-02T07:59:59Z",
    "2026-11-02T08:00:00Z",
    "2026-11-01",
    "2026-11-02",
  ],
])("separates %s local midnight around clock changes", async (timezone, before, after, a, b) => {
  state.defaults.mockResolvedValue({ timezone });
  await persistIndexingDay({ ...input, now: new Date(before) });
  await persistIndexingDay({ ...input, now: new Date(after) });
  expect([...stored.keys()]).toEqual([a, b]);
});
it.each([
  ["Europe/Warsaw", "2026-10-25T12:00:00Z", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"],
  ["America/Los_Angeles", "2026-11-01T12:00:00Z", "2026-11-01T07:00:00Z", "2026-11-02T08:00:00Z"],
])("uses a 25-hour %s calendar day", (zone, at, start, end) => {
  const day = projectDay(new Date(at), zone);
  expect(day.gte.toISOString()).toBe(new Date(start).toISOString());
  expect(day.lt.toISOString()).toBe(new Date(end).toISOString());
});
it.each(["quota", "off", null] as const)(
  "persists stop %s without inventing history",
  async (stop) => {
    await persistIndexingDay({ ...input, stop });
    expect(stored.get("2026-10-25")?.stop).toBe(stop);
  },
);
it("ignores an older completion of the same day's run", async () => {
  await persistIndexingDay({ ...input, stop: "off" });
  await persistIndexingDay({ ...input, now: new Date(now.getTime() - 1000) });
  expect(state.upsert).toHaveBeenCalledTimes(1);
});

it("keeps the daily change cohort aligned with the current property and report URLs", async () => {
  const current = "https://new.example.com/current";
  state.scope.mockResolvedValue({ where: { projectId: "p", url: { in: [current] } } });
  const history = [
    {
      url: "https://old.example.com/previous",
      previous: { coverageState: "Indexed" },
      next: { coverageState: "404" },
    },
    {
      url: "https://new.example.com/retired",
      previous: { coverageState: "Indexed" },
      next: { coverageState: "404" },
    },
    {
      url: current,
      previous: { coverageState: "Indexed" },
      next: { coverageState: "Not indexed" },
    },
  ];
  const selected = (where: { url?: { in: string[] } }) =>
    history.filter((row) => !where.url || where.url.in.includes(row.url));
  state.count.mockImplementation(async ({ where }) => selected(where).length);
  state.changes.mockImplementation(async ({ where }) => selected(where));
  await persistIndexingDay({ ...input, property: "sc-domain:new.example.com" });
  expect(stored.get("2026-10-25")).toMatchObject({
    property: "sc-domain:new.example.com",
    changes: { count: 1, entries: [{ url: current, previous: "Indexed", next: "Not indexed" }] },
  });
  expect(state.count.mock.calls[0][0].where).toMatchObject({ url: { in: [current] } });
  expect(state.changes.mock.calls[0][0].where).toEqual(state.count.mock.calls[0][0].where);
});
