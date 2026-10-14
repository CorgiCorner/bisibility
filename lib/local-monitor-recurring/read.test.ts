import { prisma } from "@/lib/db/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRecurringMonitor } from "./read";

const f = vi.hoisted(() => ({
  scope: vi.fn(),
  snapshot: vi.fn(),
  query: vi.fn(),
  calendar: vi.fn(),
  connections: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        checkSchedule: { findMany: f.calendar },
        providerConnection: { findMany: f.connections },
        $queryRaw: f.query,
      }),
  },
}));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: f.scope }));
vi.mock("@/lib/local-monitor-store/snapshot", () => ({ loadMonitorSnapshot: f.snapshot }));
vi.mock("./config", () => ({ recurringMonitorsEnabled: () => false }));
const ref = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  monitorId: "lmn_abcdefghijklmnopqrstuvwx",
};
beforeEach(() => {
  vi.resetAllMocks();
  f.scope.mockResolvedValue({ project: { id: "project" } });
  f.snapshot.mockResolvedValue({
    monitor: { id: "monitor", version: 1 },
    intent: { id: "manual-intent", mode: "manual" },
  });
  f.query.mockResolvedValue([]);
  f.calendar.mockResolvedValue([]);
  f.connections.mockResolvedValue([]);
});
describe("display-only recurring stored reads", () => {
  it("shows missing paid authority honestly and never manufactures a default calendar/connection", async () => {
    const result = await readRecurringMonitor(ref, { actor: { id: "viewer" } }, prisma);
    expect(result).toMatchObject({
      enabled: false,
      mode: "manual",
      approval: null,
      schedules: [],
      connections: [],
    });
    expect(f.scope).toHaveBeenCalledWith(
      expect.anything(),
      { actor: { id: "viewer" } },
      ref.projectId,
      "read",
    );
  });
  it("denies a removed/foreign member before any stored choice or approval query", async () => {
    f.scope.mockRejectedValue(new Error("forbidden"));
    await expect(readRecurringMonitor(ref, { actor: { id: "foreign" } }, prisma)).rejects.toThrow(
      "forbidden",
    );
    expect(f.query).not.toHaveBeenCalled();
    expect(f.calendar).not.toHaveBeenCalled();
  });
  it("marks bounded choice truncation instead of presenting a partial list as complete", async () => {
    f.calendar.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => ({
        publicId: `sch_${i}`,
        name: `Calendar${i}`,
        measurementEpoch: BigInt(i),
        timezone: "UTC",
      })),
    );
    const result = await readRecurringMonitor(ref, { actor: { id: "viewer" } }, prisma);
    expect(result.schedules).toHaveLength(50);
    expect(result.choicesTruncated).toBe(true);
  });
});
