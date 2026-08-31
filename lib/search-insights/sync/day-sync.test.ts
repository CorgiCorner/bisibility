import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncCompleteGscDay } from "./day-sync";

const mocks = vi.hoisted(() => ({ info: vi.fn(), syncPartition: vi.fn() }));
vi.mock("./activity-log", () => ({
  formatDayComplete: (date: string) => `[sync] gsc day ${date} · complete (3/3 sets)`,
  logSyncInfo: mocks.info,
}));
vi.mock("./partitions", () => ({
  PARTITION_DIMENSION_SETS: [["query"], ["page"], ["query", "page"]],
  syncDayPartition: mocks.syncPartition,
}));

const input = {
  date: "2026-08-12",
  projectId: "project_secret_123",
  property: "sc-domain:private.example",
  session: { fetchEnvelope: vi.fn(), property: "sc-domain:private.example" },
};

describe("syncCompleteGscDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncPartition.mockResolvedValue({ capHit: false });
  });

  it("logs completion only after all three committed request sets", async () => {
    await syncCompleteGscDay(input);
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.info).toHaveBeenCalledWith("[sync] gsc day 2026-08-12 · complete (3/3 sets)");
    expect(mocks.syncPartition).toHaveBeenCalledTimes(3);
  });

  it.each([1, 2, 3])("does not log completion when request set %i fails", async (set) => {
    mocks.syncPartition.mockImplementation(async () => {
      if (mocks.syncPartition.mock.calls.length === set) throw new Error("partition failed");
      return { capHit: false };
    });
    await expect(syncCompleteGscDay(input)).rejects.toThrow("partition failed");
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
