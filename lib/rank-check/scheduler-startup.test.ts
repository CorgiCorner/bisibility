import { afterEach, expect, it, vi } from "vitest";
import {
  type SchedulerStartupStore,
  startRankCheckSchedulers,
  upgradeRankSchedulerAtStartup,
} from "./scheduler-startup";
import { createSchedulerUpgradeStore } from "./scheduler-upgrade-store";
import {
  type SchedulerUpgradeInventory,
  unknownUpgradeSchedule,
} from "./scheduler-upgrade-unknown";

vi.mock("./scheduler-upgrade-store", () => ({ createSchedulerUpgradeStore: vi.fn() }));
vi.mock("@/lib/temporal/scheduler-client", () => ({
  getSchedulerTemporalClient: vi.fn(async () => ({ schedule: {} })),
}));
vi.mock("@/lib/temporal/rank-check-scheduler-convergence", () => ({
  convergeRankCheckSchedulerSingletons: vi.fn(),
  retireLegacyRankCheckReconciler: vi.fn(),
}));

function fixture() {
  const events: string[] = [];
  const project = { defaultFrequency: "daily", schedules: [] as string[] };
  const keyword = { checkScheduleId: null as string | null, keywordSchedule: null };
  const store = {
    retireReconciler: vi.fn(async () => {
      events.push("retire");
    }),
    inventory: vi.fn(async (): Promise<SchedulerUpgradeInventory> => {
      events.push("inventory");
      return {
        ownedIds: ["owned", "orphan", "unknown"],
        pausedOwnedIds: ["owned"],
        ambiguousIds: ["ambiguous", "orphan"],
        unknownSchedules: [unknownUpgradeSchedule("unknown", "keyword_missing", false)],
        failed: 0,
        inspected: 3,
        listed: 3,
        dispatcher: "absent" as const,
        reconciler: "paused" as const,
        unrelatedHash: "unchanged",
        unrelatedIds: ["ai-tracking"],
      };
    }),
    repair: vi.fn(async () => {
      if (project.defaultFrequency === "daily" && keyword.keywordSchedule === null) {
        project.schedules.push("Recovered daily");
        keyword.checkScheduleId = "Recovered daily";
      }
      return { assignments: [{ assigned: true }] };
    }),
    activate: vi.fn(async () => {
      events.push("activate");
      return {};
    }),
  } satisfies SchedulerStartupStore & { repair(): Promise<unknown> };
  return { store, events, project, keyword };
}

afterEach(() => vi.restoreAllMocks());

it("leaves an unassigned keyword inheriting a daily project default unchanged", async () => {
  const { store, events, project, keyword } = fixture();
  expect(await upgradeRankSchedulerAtStartup(store)).toMatchObject({
    ownedLegacySchedules: 1,
    unrecognizedSchedules: 3,
  });
  expect(events).toEqual(["inventory", "retire", "activate"]);
  expect(keyword.checkScheduleId).toBeNull();
  expect(project.schedules).toEqual([]);
  expect(store.repair).not.toHaveBeenCalled();
});

it.each(["inventory", "retireReconciler"] as const)(
  "does not activate after a failed %s",
  async (stage) => {
    const { store } = fixture();
    vi.mocked(store[stage]).mockRejectedValueOnce(new Error("unavailable"));
    await expect(upgradeRankSchedulerAtStartup(store)).rejects.toThrow("unavailable");
    expect(store.activate).not.toHaveBeenCalled();
    await expect(upgradeRankSchedulerAtStartup(store)).resolves.toMatchObject({
      ownedLegacySchedules: 1,
    });
    expect(store.activate).toHaveBeenCalledOnce();
  },
);

it("refuses partial inventory before retiring or activating", async () => {
  const { store } = fixture();
  vi.mocked(store.inventory).mockResolvedValueOnce({ ...(await store.inventory()), failed: 1 });
  await expect(upgradeRankSchedulerAtStartup(store)).rejects.toThrow("inspect legacy schedules");
  expect(store.retireReconciler).not.toHaveBeenCalled();
  expect(store.activate).not.toHaveBeenCalled();
});

it.each(["reconciler", "owned"] as const)(
  "requires an offline upgrade for active legacy %s",
  async (active) => {
    const { store } = fixture();
    const inventory = await store.inventory();
    vi.mocked(store.inventory).mockResolvedValueOnce({
      ...inventory,
      reconciler: active === "reconciler" ? "active" : "paused",
      pausedOwnedIds: active === "owned" ? [] : ["owned"],
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(upgradeRankSchedulerAtStartup(store)).rejects.toThrow(
      "Complete the offline scheduler upgrade (npm run scheduler:upgrade) before starting dispatcher mode.",
    );
    expect(error).toHaveBeenCalledWith("[temporal] legacy rank scheduler upgrade required", {
      activeOwnedSchedules: active === "owned" ? ["owned"] : [],
      membershipRepair: "disabled",
    });
    expect(store.retireReconciler).not.toHaveBeenCalled();
    expect(store.activate).not.toHaveBeenCalled();
  },
);

it("logs startup and warns about unrecognized schedules", async () => {
  const { store } = fixture();
  vi.mocked(createSchedulerUpgradeStore).mockReturnValue(store as never);
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await startRankCheckSchedulers("dispatcher");
  expect(info).toHaveBeenCalledWith("[temporal] rank scheduler startup", {
    membershipRepair: "disabled",
    ownedLegacySchedules: 1,
    unrecognizedSchedules: 3,
  });
  expect(warn).toHaveBeenCalledOnce();
  expect(store.activate).toHaveBeenCalledOnce();
});
