import { expect, it, vi } from "vitest";
import { runStagedMigrationPipeline } from "./staged-data-migrations";

it("finishes the earlier import before exposing the later prerequisite and guarded contract", async () => {
  const calls: string[] = [];
  let completed = new Set<string>();
  await runStagedMigrationPipeline({
    activeIds: ["old_import", "later_import"],
    completed: async () => completed,
    prisma: async (done) => {
      calls.push(done.has("old_import") ? "later_prerequisite" : "old_prerequisite");
    },
    runData: async () => {
      const id = completed.has("old_import") ? "later_import" : "old_import";
      calls.push(id);
      completed = new Set([...completed, id]);
    },
    contracts: async () => { calls.push("contracts"); },
  });
  expect(calls).toEqual([
    "old_prerequisite", "old_import", "later_prerequisite", "later_import", "contracts",
  ]);
});

it("refuses a missing prerequisite without running final contracts or looping indefinitely", async () => {
  const contracts = vi.fn();
  const prisma = vi.fn();
  await expect(runStagedMigrationPipeline({
    activeIds: ["unready"], completed: async () => new Set(),
    prisma, runData: async () => undefined, contracts,
  })).rejects.toThrow("prerequisites could not advance");
  expect(prisma).toHaveBeenCalledOnce();
  expect(contracts).not.toHaveBeenCalled();
});

it("does not advance DDL after an import fails", async () => {
  const prisma = vi.fn();
  const contracts = vi.fn();
  await expect(runStagedMigrationPipeline({
    activeIds: ["failed"], completed: async () => new Set(), prisma,
    runData: async () => { throw new Error("owned failure"); }, contracts,
  })).rejects.toThrow("owned failure");
  expect(prisma).toHaveBeenCalledOnce();
  expect(contracts).not.toHaveBeenCalled();
});
