import { afterEach, expect, it, vi } from "vitest";
import { convergeRankCheckSchedulerSingletons } from "../temporal/rank-check-scheduler-convergence";
import { createSchedulerUpgradeStore } from "./scheduler-upgrade-store";

vi.mock("../temporal/rank-check-scheduler-convergence", () => ({
  convergeRankCheckSchedulerSingletons: vi.fn(),
}));
afterEach(() => vi.unstubAllEnvs());
it("activates and pauses with explicit modes without changing the caller's environment, including failures", async () => {
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
  const client = { schedule: {} };
  const store = createSchedulerUpgradeStore(client as never);
  await store.pauseSingletons();
  expect(convergeRankCheckSchedulerSingletons).toHaveBeenLastCalledWith(client.schedule, "cutover");
  expect(process.env.RANK_CHECK_SCHEDULER_MODE).toBe("dispatcher");
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
  await store.activate();
  expect(convergeRankCheckSchedulerSingletons).toHaveBeenLastCalledWith(
    client.schedule,
    "dispatcher",
  );
  expect(process.env.RANK_CHECK_SCHEDULER_MODE).toBe("cutover");
  vi.mocked(convergeRankCheckSchedulerSingletons).mockRejectedValueOnce(new Error("unavailable"));
  await expect(store.activate()).rejects.toThrow("unavailable");
  expect(process.env.RANK_CHECK_SCHEDULER_MODE).toBe("cutover");
});
