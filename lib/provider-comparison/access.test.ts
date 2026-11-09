import { beforeEach, expect, it, vi } from "vitest";

const operation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccessInTransaction: operation,
}));

import { assertComparisonAccess, assertComparisonHistoryWrite } from "./access";

const tx = () => ({
  $queryRaw: vi
    .fn()
    .mockResolvedValueOnce([{ ownerId: "actor", isSample: false, writeMode: "active" }])
    .mockResolvedValueOnce([{ id: "actor" }])
    .mockResolvedValueOnce([{ role: "owner" }]),
});
beforeEach(() => vi.clearAllMocks());
it("saving retained results checks membership without starting the paid-operation gate", async () => {
  await assertComparisonHistoryWrite(tx() as never, "p", "actor");
  expect(operation).not.toHaveBeenCalled();
});
it("a new provider search still requires paid-operation admission", async () => {
  operation.mockRejectedValueOnce(new Error("blocked"));
  await expect(assertComparisonAccess(tx() as never, "p", "actor", true)).rejects.toThrow(
    "blocked",
  );
  expect(operation).toHaveBeenCalledTimes(1);
});
it("history writes do not grant access to nonmembers", async () => {
  const db = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ ownerId: "owner" }])
      .mockResolvedValueOnce([{ id: "actor" }])
      .mockResolvedValueOnce([]),
  };
  await expect(assertComparisonHistoryWrite(db as never, "p", "actor")).rejects.toThrow();
});

it.each([
  { isSample: true, writeMode: "active" },
  { isSample: false, writeMode: "read_only" },
])("denies history writes to read-only projects", async (project) => {
  const db = tx();
  db.$queryRaw
    .mockReset()
    .mockResolvedValueOnce([{ ownerId: "actor", ...project }])
    .mockResolvedValueOnce([{ id: "actor" }])
    .mockResolvedValueOnce([]);
  await expect(assertComparisonHistoryWrite(db as never, "p", "actor")).rejects.toThrow(
    "read-only",
  );
});
