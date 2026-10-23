import {
  DEFAULT_RANK_CHECK_PLANNER_INTERVAL,
  plannerIntervalMinutes,
} from "@/lib/rank-check/planner-interval";
import { afterEach, describe, expect, it, vi } from "vitest";
import { schedulePlanningMinutes } from "./planning-visibility";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());
describe("schedule planning visibility policy", () => {
  it("matches the unchanged fifteen-minute worker default", () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("RANK_CHECK_PLANNER_INTERVAL", "");
    expect(DEFAULT_RANK_CHECK_PLANNER_INTERVAL).toBe("15 minutes");
    expect(plannerIntervalMinutes(DEFAULT_RANK_CHECK_PLANNER_INTERVAL)).toBe(900000 / 60000);
    expect(schedulePlanningMinutes()).toBe(15);
  });
  it.each([
    ["30 minutes", 30],
    ["1 hour", 60],
    ["90 seconds", 2],
    ["900000ms", 15],
    ["1h30m", null],
    ["", null],
    ["0 minutes", null],
    ["Infinity minutes", null],
  ])("conservatively projects %s", (interval, minutes) => {
    expect(plannerIntervalMinutes(String(interval))).toBe(minutes);
  });
  it("respects a recognized override, leaves unrecognized intervals unnumbered", () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("RANK_CHECK_PLANNER_INTERVAL", "30 minutes");
    expect(schedulePlanningMinutes()).toBe(30);
    vi.stubEnv("RANK_CHECK_PLANNER_INTERVAL", "1h30m");
    expect(schedulePlanningMinutes()).toBeNull();
  });
  it("shows the dispatcher interval after upgrading retired legacy configuration", () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
    vi.stubEnv("RANK_CHECK_PLANNER_INTERVAL", "30 minutes");
    expect(schedulePlanningMinutes()).toBe(30);
  });
  it("does not promise the dispatcher interval during cutover", () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    expect(schedulePlanningMinutes()).toBeNull();
  });
});
