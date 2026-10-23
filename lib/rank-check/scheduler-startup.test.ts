import { expect, it, vi } from "vitest";
import { type SchedulerStartupStore, upgradeRankSchedulerAtStartup } from "./scheduler-startup";

function fixture() {
  const events: string[] = [];
  const store: SchedulerStartupStore = {
    retireReconciler: vi.fn(async () => {
      events.push("retire");
    }),
    inventory: vi.fn(async () => ({
      ownedIds: ["owned", "orphan"],
      pausedOwnedIds: [],
      ambiguousIds: ["ambiguous", "orphan"],
      failed: 0,
      inspected: 3,
      listed: 3,
      dispatcher: "absent" as const,
      reconciler: "paused" as const,
      unrelatedHash: "unchanged",
      unrelatedIds: ["ai-tracking"],
    })),
    pauseOwned: vi.fn(async (id) => {
      events.push(`pause:${id}`);
    }),
    repair: vi.fn(async () => {
      events.push("repair");
      return { assignments: [{ assigned: true }, { assigned: false }] };
    }),
    activate: vi.fn(async () => {
      events.push("activate");
      return {};
    }),
  };
  return { store, events };
}

it("retires recognized producers, repairs missing membership, then activates without an offline CLI", async () => {
  const { store, events } = fixture();
  expect(await upgradeRankSchedulerAtStartup(store)).toMatchObject({
    pausedLegacySchedules: 1,
    recoveredKeywords: 1,
    unrecognizedSchedules: 2,
  });
  expect(events).toEqual(["retire", "pause:owned", "repair", "activate"]);
  expect(store.pauseOwned).not.toHaveBeenCalledWith("orphan");
  expect(store.pauseOwned).not.toHaveBeenCalledWith("ai-tracking");
});

it.each(["inventory", "pauseOwned", "repair"] as const)(
  "does not activate after a failed %s",
  async (stage) => {
    const { store } = fixture();
    vi.mocked(store[stage]).mockRejectedValueOnce(new Error("unavailable"));
    await expect(upgradeRankSchedulerAtStartup(store)).rejects.toThrow("unavailable");
    expect(store.activate).not.toHaveBeenCalled();
    await expect(upgradeRankSchedulerAtStartup(store)).resolves.toMatchObject({
      recoveredKeywords: 1,
    });
  },
);

it("refuses partial inventory instead of starting a second producer", async () => {
  const { store } = fixture();
  vi.mocked(store.inventory).mockResolvedValueOnce({ ...(await store.inventory()), failed: 1 });
  await expect(upgradeRankSchedulerAtStartup(store)).rejects.toThrow("inspect legacy schedules");
  expect(store.repair).not.toHaveBeenCalled();
  expect(store.activate).not.toHaveBeenCalled();
});
