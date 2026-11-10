import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), start: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) },
}));
vi.mock("@/lib/provider-comparison/access", () => ({
  assertComparisonHistoryWrite: m.auth,
  assertComparisonAccess: m.auth,
}));
vi.mock("./source", () => ({ loadRepairSource: m.source }));
vi.mock("@/lib/temporal/serp-url-repair-client", () => ({
  startSerpUrlRepair: m.start,
  serpUrlRepairStatus: m.status,
}));

import { enqueueUrlRepair, readUrlRepairStatus } from "./service";

const input = {
  projectId: "project",
  actorId: "actor",
  target: { kind: "check" as const, checkId: "check_abcdefgh" },
};
beforeEach(() => {
  vi.resetAllMocks();
  m.source.mockResolvedValue({
    id: "internal",
    hash: "hash",
    body: {},
    rows: [{ type: "organic", url: "https://google.com/goto?url=one" }],
  });
});
it("reports acceptance only after the durable scheduler acknowledges it and never sends URLs to workflow history", async () => {
  m.start.mockRejectedValueOnce(new Error("Scheduler unavailable"));
  await expect(enqueueUrlRepair(input)).rejects.toThrow("Scheduler unavailable");
  m.start.mockResolvedValue(undefined);
  expect(await enqueueUrlRepair(input)).toMatchObject({ status: "running" });
  expect(m.start.mock.calls[1][0]).toEqual({
    ...input,
    workflowId: "serp-url-repair:project:internal:hash",
    sourceHash: "hash",
  });
});
it("does not start a task for fully resolved evidence", async () => {
  m.source.mockResolvedValue({
    id: "internal",
    hash: "hash",
    body: {},
    rows: [{ type: "organic", url: "https://destination.test/" }],
  });
  expect(await enqueueUrlRepair(input)).toMatchObject({ status: "completed" });
  expect(m.start).not.toHaveBeenCalled();
});
it("does not disclose another source's workflow status", async () => {
  await expect(readUrlRepairStatus({ ...input, workflowId: "another-project" })).rejects.toThrow(
    "changed",
  );
  expect(m.status).not.toHaveBeenCalled();
});
