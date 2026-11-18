import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleReviewGateError } from "./errors";
import { setScheduleStateNow } from "./mutation-runs";

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  read: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./current-state", () => ({ readScheduleState: mocks.read }));
vi.mock("@/lib/rank-check/schedules/archive", () => ({
  archiveSchedule: mocks.archive,
  restoreSchedule: mocks.restore,
}));

const actor = { id: "user_1", memberships: [] };
const tx = { $queryRaw: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rank lifecycle transaction ownership", () => {
  it("refuses a shared transaction for restore", async () => {
    mocks.read.mockResolvedValue({ kind: "rank", state: "archived" });
    await expect(
      setScheduleStateNow(
        "project_1",
        actor,
        "sch_a00000000000000000000000",
        "paused",
        { kind: "rank", restore: true },
        tx as never,
      ),
    ).rejects.toBeInstanceOf(ScheduleReviewGateError);
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("passes the receipt transaction through archive and move", async () => {
    mocks.read.mockResolvedValue({ kind: "rank", state: "active" });
    mocks.archive.mockResolvedValue({ changed: true });
    await expect(
      setScheduleStateNow(
        "project_1",
        actor,
        "sch_a00000000000000000000000",
        "archived",
        { kind: "rank" },
        tx as never,
      ),
    ).resolves.toEqual({ changed: true });
    expect(mocks.archive).toHaveBeenCalledWith(
      actor.id,
      "project_1",
      { destinationScheduleId: null, scheduleId: "sch_a00000000000000000000000" },
      tx,
    );
  });
});
