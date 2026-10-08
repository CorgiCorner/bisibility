import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), sync: vi.fn(), expire: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock("./entry-sync", () => ({ syncUsageEntry: mocks.sync }));
vi.mock("./runtime", () => ({
  meteringNamespace: () => "test",
  meteringRuntime: async () => ({ meter: { expireReservations: mocks.expire } }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("METERING_SHADOW", "on");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T00:00:00Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("advances past a full page that could not be imported and retries it on the next sweep", async () => {
  const oldRows = Array.from({ length: 100 }, (_, i) => ({
    id: `old-${i}`,
    createdAt: new Date("2026-09-01T00:00:00Z"),
  }));
  const newer = { id: "newer", createdAt: new Date("2026-09-02T00:00:00Z") };
  mocks.query.mockImplementation(async (query: { values: unknown[] }) =>
    query.values.includes("old-99") ? [newer] : oldRows,
  );
  // The safe synchronization seam returns normally even when no operation was persisted.
  mocks.sync.mockResolvedValue(undefined);
  const { maintainMeteringShadow } = await import("./maintenance");
  await maintainMeteringShadow();
  expect(mocks.sync).toHaveBeenCalledTimes(100);
  await maintainMeteringShadow();
  expect(mocks.sync).toHaveBeenCalledWith("newer");
  expect(mocks.sync).toHaveBeenCalledTimes(101);
  await maintainMeteringShadow();
  expect(mocks.sync).toHaveBeenCalledTimes(201);
  expect(mocks.expire).toHaveBeenCalledTimes(3);
});

it("keeps the sweep cutoff fixed when its pages cross a month boundary", async () => {
  vi.setSystemTime(new Date("2026-09-30T23:59:59Z"));
  mocks.query
    .mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({
        id: `row-${i}`,
        createdAt: new Date("2026-09-29T00:00:00Z"),
      })),
    )
    .mockResolvedValue([]);
  const { maintainMeteringShadow } = await import("./maintenance");
  await maintainMeteringShadow();
  vi.setSystemTime(new Date("2026-10-01T00:00:01Z"));
  await maintainMeteringShadow();
  const dates = mocks.query.mock.calls[1]?.[0].values.filter((v: unknown) => v instanceof Date);
  expect(dates).not.toContainEqual(new Date("2026-10-01T00:00:00Z"));
  expect(dates).toContainEqual(new Date("2026-09-30T23:59:59Z"));
});

it("does not scan or expire reservations when disabled", async () => {
  vi.stubEnv("METERING_SHADOW", "off");
  const { maintainMeteringShadow } = await import("./maintenance");
  await maintainMeteringShadow();
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.expire).not.toHaveBeenCalled();
});
