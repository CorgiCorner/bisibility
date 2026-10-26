import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("@/lib/ops/temporal-snapshot", () => ({ getTemporalSnapshot: mocks.snapshot }));

import { indexingBackgroundRun } from "./ui-schedule";

const now = new Date("2026-10-25T12:00:00Z");
const state = {
  status: "ok",
  collectedAt: now.toISOString(),
  heartbeat: {
    indexingSchedule: {
      paused: false,
      nextActionTimes: ["2026-10-27T06:30:00Z", "2026-10-26T06:30:00Z", "2026-10-24T06:30:00Z"],
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.snapshot.mockResolvedValue(state);
});
it("does not read the snapshot when inspection is disabled", async () => {
  expect(await indexingBackgroundRun(false, now)).toEqual({ state: "disabled", nextAt: null });
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
it("uses the worker's actual future Schedule actions, including overrides", async () => {
  expect(await indexingBackgroundRun(true, now)).toEqual({
    state: "scheduled",
    nextAt: "2026-10-26T06:30:00.000Z",
  });
});
it("does not promise a run for a paused Schedule", async () => {
  mocks.snapshot.mockResolvedValue({
    ...state,
    heartbeat: { indexingSchedule: { ...state.heartbeat.indexingSchedule, paused: true } },
  });
  expect(await indexingBackgroundRun(true, now)).toEqual({ state: "paused", nextAt: null });
});
it.each([
  null,
  { ...state, status: "stale" },
  { ...state, heartbeat: {} },
  { ...state, collectedAt: "2026-10-26T00:00:00Z" },
])("keeps missing, legacy, stale and future observations unknown", async (snapshot) => {
  mocks.snapshot.mockResolvedValue(snapshot);
  expect(await indexingBackgroundRun(true, now)).toEqual({ state: "unavailable", nextAt: null });
});
it("keeps snapshot storage failures unknown", async () => {
  mocks.snapshot.mockRejectedValue(new Error("unavailable"));
  expect(await indexingBackgroundRun(true, now)).toEqual({ state: "unavailable", nextAt: null });
});

it("does not block the report on an unavailable snapshot store", async () => {
  vi.useFakeTimers();
  try {
    mocks.snapshot.mockReturnValue(new Promise(() => {}));
    const read = indexingBackgroundRun(true, now);
    await vi.advanceTimersByTimeAsync(250);
    expect(await read).toEqual({ state: "unavailable", nextAt: null });
  } finally {
    vi.useRealTimers();
  }
});
