import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  costEntries: vi.fn(),
  update: vi.fn(),
  load: vi.fn(),
  shadow: vi.fn(),
  sync: vi.fn(),
  owns: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    queuedRankCheckTask: { findUnique: mocks.find, update: mocks.update },
    providerCostEntry: { findMany: mocks.costEntries },
  },
}));
vi.mock("./entry-sync", () => ({ loadUsageEntry: mocks.load, syncUsageEntry: mocks.sync }));
vi.mock("./shadow-runtime", () => ({ shadowForProject: mocks.shadow }));
vi.mock("@/lib/provider-usage/admission-extension", () => ({ ownAdmission: { owns: mocks.owns } }));

import { persistQueuedHandoff, resumeQueuedMetering, settleQueuedMetering } from "./queued-context";

beforeEach(() => {
  mocks.owns.mockResolvedValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const handoff = {
  operationId: "op",
  leaseId: "lease",
  kind: "lease" as const,
  expiresAt: "2026-09-25T00:00:00Z",
};
it("persists operation and lease on the durable task payload", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  await persistQueuedHandoff("task", handoff);
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: "task" },
    data: { meteringContext: handoff },
  });
});
it("worker resumes from the payload and synchronizes after the legacy transaction commits", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  mocks.find.mockResolvedValue({ meteringContext: handoff });
  const entry = { id: "op", projectId: "project", namespace: "retained-namespace" };
  mocks.load.mockResolvedValue(entry);
  const resume = vi.fn();
  mocks.shadow.mockResolvedValue({ resume });
  await resumeQueuedMetering("task");
  expect(resume).toHaveBeenCalledWith(entry, handoff);
  expect(mocks.shadow).toHaveBeenCalledWith("project", "retained-namespace");
  await settleQueuedMetering("task");
  expect(mocks.sync).toHaveBeenCalledWith("op");
});
it("recovers a missing task payload from one scoped own-key receipt", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  mocks.find.mockResolvedValue({
    meteringContext: null,
    batch: { projectId: "project", connectionId: "connection" },
  });
  mocks.costEntries.mockResolvedValue([{ id: "op" }]);
  const entry = { id: "op", projectId: "project", namespace: "retained-namespace" };
  mocks.load.mockResolvedValue(entry);
  const resume = vi.fn();
  mocks.shadow.mockResolvedValue({ resume });
  await resumeQueuedMetering("task");
  expect(mocks.costEntries).toHaveBeenCalledWith({
    where: {
      correlationId: "task",
      projectId: "project",
      connectionId: "connection",
      credentialSource: "own",
    },
    select: { id: true },
    take: 2,
  });
  expect(resume).toHaveBeenCalledWith(entry, undefined);
  await settleQueuedMetering("task");
  expect(mocks.sync).toHaveBeenCalledWith("op");
});
it("does not resume a second observer for an authoritative own attempt", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  mocks.find.mockResolvedValue({ meteringContext: handoff });
  mocks.load.mockResolvedValue({ id: "op", projectId: "project", namespace: "retained-namespace" });
  mocks.owns.mockResolvedValue(true);

  await resumeQueuedMetering("task");

  expect(mocks.owns).toHaveBeenCalledWith(expect.anything(), "op");
  expect(mocks.shadow).not.toHaveBeenCalled();
});
it("fails closed when two receipts match a task without a payload", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  mocks.find.mockResolvedValue({
    meteringContext: null,
    batch: { projectId: "project", connectionId: "connection" },
  });
  mocks.costEntries.mockResolvedValue([{ id: "a" }, { id: "b" }]);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await resumeQueuedMetering("task");
  await settleQueuedMetering("task");
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith("[metering] queued context unavailable", {
    taskId: "task",
    reason: "ambiguous legacy receipt",
  });
  warn.mockRestore();
});
it("does no work while globally disabled", async () => {
  vi.stubEnv("METERING_SHADOW", "off");
  await resumeQueuedMetering("task");
  await settleQueuedMetering("task");
  expect(mocks.find).not.toHaveBeenCalled();
  expect(mocks.costEntries).not.toHaveBeenCalled();
});
it("storage failure never fails the queued provider task", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  mocks.find.mockRejectedValue(new Error("offline"));
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await expect(resumeQueuedMetering("task")).resolves.toBeUndefined();
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
