import { expect, it, vi } from "vitest";
import { upgradeRankScheduler } from "./scheduler-upgrade";
import type { RankCheckScheduleInventory } from "./temporal-schedule-retirement";

function fixture() {
  const legacy = new Set(["rank-check-one", "rank-check-two"]);
  const paused = new Set<string>();
  const inventory = (): Promise<RankCheckScheduleInventory> =>
    Promise.resolve({
      ownedIds: [...legacy],
      pausedOwnedIds: [...paused],
      ambiguousIds: [],
      unrelatedIds: ["alerts"],
      unrelatedHash: "same",
      reconciler: "paused" as const,
      dispatcher: "paused" as const,
      failed: 0,
      inspected: 3,
      listed: 3,
    });
  const store = {
    inventory: vi.fn(inventory),
    conflicts: vi.fn(async () => [] as string[]),
    pauseSingletons: vi.fn(async () => undefined),
    pauseOwned: vi.fn(async (id: string) => {
      paused.add(id);
    }),
    running: vi.fn(async () => 0),
    activate: vi.fn(async () => undefined),
  };
  return { store, paused };
}

it("previews legacy work without touching Temporal", async () => {
  const { store } = fixture();
  expect(await upgradeRankScheduler(store, { apply: false, workersStopped: false })).toEqual({
    legacySchedules: 2,
    conflicts: [],
    applied: false,
  });
  expect(store.pauseSingletons).not.toHaveBeenCalled();
  expect(store.activate).not.toHaveBeenCalled();
});
it("pauses producers and legacy schedules before activating the planner, and can be rerun", async () => {
  const { store, paused } = fixture();
  await upgradeRankScheduler(store, { apply: true, workersStopped: true });
  await upgradeRankScheduler(store, { apply: true, workersStopped: true });
  expect([...paused]).toEqual(["rank-check-one", "rank-check-two"]);
  expect(store.pauseSingletons.mock.invocationCallOrder[0]).toBeLessThan(
    store.pauseOwned.mock.invocationCallOrder[0],
  );
  expect(store.pauseOwned.mock.invocationCallOrder[1]).toBeLessThan(
    store.activate.mock.invocationCallOrder[0],
  );
});
it("requires offline acknowledgement before writes", async () => {
  const { store } = fixture();
  await expect(upgradeRankScheduler(store, { apply: true, workersStopped: false })).rejects.toThrow(
    "--workers-stopped",
  );
  expect(store.pauseSingletons).not.toHaveBeenCalled();
});
it("does not guess when legacy and named schedule intent disagree", async () => {
  const { store } = fixture();
  store.conflicts.mockResolvedValue(["keyword-one"]);
  await expect(upgradeRankScheduler(store, { apply: true, workersStopped: true })).rejects.toThrow(
    "conflicts",
  );
  expect(store.pauseSingletons).not.toHaveBeenCalled();
});
it("leaves old work paused if workflows have not drained", async () => {
  const { store, paused } = fixture();
  store.running.mockResolvedValue(1);
  await expect(upgradeRankScheduler(store, { apply: true, workersStopped: true })).rejects.toThrow(
    "still running",
  );
  expect(paused.size).toBe(2);
  expect(store.activate).not.toHaveBeenCalled();
});
it("refuses ambiguous ownership before mutations", async () => {
  const { store } = fixture();
  const base = await store.inventory();
  store.inventory.mockResolvedValue({ ...base, ambiguousIds: ["rank-check-other"] });
  await expect(upgradeRankScheduler(store, { apply: true, workersStopped: true })).rejects.toThrow(
    "ambiguous",
  );
  expect(store.pauseSingletons).not.toHaveBeenCalled();
});
it("cannot activate after an interruption while pausing legacy output", async () => {
  const { store } = fixture();
  store.pauseOwned.mockRejectedValueOnce(new Error("offline"));
  await expect(upgradeRankScheduler(store, { apply: true, workersStopped: true })).rejects.toThrow(
    "offline",
  );
  expect(store.activate).not.toHaveBeenCalled();
});

it("reports unknown schedules during preview rather than hiding the remediation", async () => {
  const { store } = fixture();
  const inventory = await store.inventory();
  store.inventory.mockResolvedValue({ ...inventory, ambiguousIds: ["rank-check-deleted"] });
  await expect(
    upgradeRankScheduler(store, { apply: false, workersStopped: false }),
  ).resolves.toMatchObject({ applied: false });
  expect(store.activate).not.toHaveBeenCalled();
});
