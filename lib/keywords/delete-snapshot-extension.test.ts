import { beforeEach, expect, it, vi } from "vitest";
import { deleteKeywordTargets } from "./delete";

const mocks = vi.hoisted(() => ({ lock: vi.fn(), cancel: vi.fn(), reconcile: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: mocks.lock,
}));
vi.mock("@/lib/rank-check/runs/cancel", () => ({ cancelRunItemsForKeywordDeletion: mocks.cancel }));
vi.mock("@/lib/rank-check/planner/reconcile-schedule", () => ({
  reconcilePlannedRunsForSchedule: mocks.reconcile,
}));
beforeEach(() => vi.clearAllMocks());
it("blocks app and API deletion while an extension can still make a provider request", async () => {
  const tx = {
    keyword: {
      findMany: vi.fn(async () => [{ id: "keyword", rankChecks: [{ id: "check" }] }]),
      deleteMany: vi.fn(),
    },
  };
  await expect(
    deleteKeywordTargets(tx as never, "project", ["kw_abcdefghijklmnopqrstuvwx"]),
  ).rejects.toThrow("snapshot extension is still running");
  expect(mocks.lock).toHaveBeenCalledWith(tx, "project");
  expect(tx.keyword.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      select: expect.objectContaining({
        rankChecks: expect.objectContaining({
          where: {
            AND: [
              { raw: { path: ["snapshotExtension", "state"], equals: "running" } },
              { raw: { path: ["snapshotExtension", "leaseUntil"], gt: expect.any(String) } },
            ],
          },
        }),
      }),
    }),
  );
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(tx.keyword.deleteMany).not.toHaveBeenCalled();
});
