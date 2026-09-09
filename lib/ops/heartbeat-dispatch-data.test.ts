import { describe, expect, it, vi } from "vitest";
import { collectRankDispatchHeartbeat } from "./heartbeat-dispatch-data";

describe("dispatch collection failures", () => {
  it("rejects a missing aggregate row instead of claiming an empty backlog", async () => {
    const database = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await expect(collectRankDispatchHeartbeat(new Date(), database as never)).rejects.toThrow(
      "Rank dispatch heartbeat aggregate is unavailable.",
    );
  });

  it("propagates a database error instead of replacing it with zero counts", async () => {
    const database = { $queryRaw: vi.fn().mockRejectedValue(new Error("query failed")) };
    await expect(collectRankDispatchHeartbeat(new Date(), database as never)).rejects.toThrow(
      "query failed",
    );
  });
});
