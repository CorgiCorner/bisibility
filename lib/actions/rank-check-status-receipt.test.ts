import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ receipt: vi.fn(), check: vi.fn(), checks: vi.fn(), scope: vi.fn() }));
vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: m.receipt }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { rankCheck: { findUnique: m.check, findMany: m.checks } },
}));
vi.mock("./_shared", () => ({
  getActionActor: async () => ({ id: "a" }),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireKeywordScope: m.scope,
  requireProjectScope: async () => ({ id: "p" }),
}));

import { getRankCheckStatus, getRankCheckStatuses } from "./rank-check-status";

const rankCheckId = "check_abcdefghijklmnopqrstuvwx";
beforeEach(() => {
  vi.clearAllMocks();
  m.scope.mockResolvedValue({});
  m.check.mockResolvedValue({
    status: "completed",
    finishedAt: new Date(),
    keyword: { publicId: "kw_abcdefghijklmnopqrstuvwx" },
  });
});
it.each(["completed", "running"])("records only completed single delivery (%s)", async (status) => {
  m.check.mockResolvedValue({
    status,
    finishedAt: new Date(),
    keyword: { publicId: "kw_abcdefghijklmnopqrstuvwx" },
  });
  await getRankCheckStatus({ rankCheckId });
  expect(m.receipt).toHaveBeenCalledWith({
    userId: "a",
    surface: "app",
    nonEmpty: status === "completed",
  });
});
it("does not record an unauthorized delivery", async () => {
  m.scope.mockRejectedValue(new Error("not allowed"));
  await expect(getRankCheckStatus({ rankCheckId })).rejects.toThrow();
  expect(m.receipt).not.toHaveBeenCalled();
});
it("records completed results returned in a batch", async () => {
  m.checks.mockResolvedValue([
    { publicId: rankCheckId, status: "completed", finishedAt: new Date() },
  ]);
  await getRankCheckStatuses({
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    rankCheckIds: [rankCheckId],
  });
  expect(m.receipt).toHaveBeenCalledWith({ userId: "a", surface: "app", nonEmpty: true });
});
