import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readEvidence: vi.fn(),
  projection: vi.fn(),
  db: {
    rankCheck: { findMany: vi.fn() },
    opsEvent: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    providerConnection: { findMany: vi.fn() },
    operationalRun: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "admin" } }) }));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: async () => ({ user: { id: "admin" } }),
}));
vi.mock("@/lib/email/allowance", () => ({ getInstanceAdminEmailAllowance: async () => ({}) }));
vi.mock("@/lib/ops/heartbeat-evidence-read", () => ({ readHeartbeatEvidence: mocks.readEvidence }));
vi.mock("@/lib/provider-evidence/projection/read", () => ({ readCheckEvidence: mocks.projection }));

import {
  getOssChecks,
  getOssDataSources,
  getOssNotifications,
  getOssOverview,
  getOssWorker,
} from "./oss-operations";

const now = new Date("2026-11-05T12:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCHEDULER_DRIVER", "none");
  mocks.db.rankCheck.findMany.mockResolvedValue([
    {
      publicId: "check",
      attempts: [],
      checkedAt: now,
      status: "completed",
      provider: "test",
      keyword: { id: "kw", text: "test", projectId: "prj" },
      startedAt: null,
      scheduledAt: null,
      error: null,
    },
  ]);
  mocks.db.opsEvent.findMany.mockResolvedValue([]);
  mocks.db.opsEvent.findFirst.mockResolvedValue(null);
  mocks.db.opsEvent.count.mockResolvedValue(0);
  mocks.db.providerConnection.findMany.mockResolvedValue([]);
  mocks.db.operationalRun.findMany.mockResolvedValue([]);
  mocks.readEvidence.mockRejectedValue(new Error("evidence unavailable"));
  mocks.projection.mockRejectedValue(new Error("projection unavailable"));
});
it.each([getOssChecks, getOssWorker, getOssOverview, getOssDataSources, getOssNotifications])(
  "keeps OSS rank health available without invoking failing evidence readers: %s",
  async (builder) => {
    const result = await builder(now);
    expect(result?.data.availability.rankChecks).toBe(true);
    expect(result?.data.rank24h.succeeded).toBe(1);
    expect(result?.data.rank24h).not.toHaveProperty("evidenceCounts");
    expect(mocks.readEvidence).not.toHaveBeenCalled();
    expect(mocks.projection).not.toHaveBeenCalled();
  },
);
