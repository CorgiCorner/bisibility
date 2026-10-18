import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ upsert: vi.fn(), createMany: vi.fn(), publish: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { achievementState: { upsert: m.upsert }, achievementDay: { createMany: m.createMany } },
}));
vi.mock("@/lib/worker-intents/realtime", () => ({ publishWorkerIntent: m.publish }));
vi.mock("./config", () => ({
  achievementsEnabled: () => process.env.ACHIEVEMENTS_ENABLED !== "false",
}));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: () => ({ kind: "disabled" }) }));

import { recordActivity } from "./capture";

describe("trusted daily activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "true");
    vi.setSystemTime(new Date("2026-10-16T22:30:00Z"));
    m.upsert.mockResolvedValue({ enabled: true, epoch: 2, timeZone: "Europe/Warsaw" });
    m.createMany.mockResolvedValue({ count: 1 });
  });
  it("uses server time and zone, stores no request payload, and wakes the existing worker", async () => {
    expect(await recordActivity("user-a", "practice")).toBe(true);
    expect(m.createMany.mock.calls[0][0]).toMatchObject({
      skipDuplicates: true,
      data: [
        {
          userId: "user-a",
          epoch: 2,
          kind: "practice",
          localDay: "2026-10-17",
          timeZone: "Europe/Warsaw",
        },
      ],
    });
    expect(m.publish).toHaveBeenCalledWith("achievements");
  });
  it("duplicate visits and disabled participation cause no repeated work", async () => {
    m.createMany.mockResolvedValue({ count: 0 });
    expect(await recordActivity("user-a", "presence")).toBe(false);
    expect(m.publish).not.toHaveBeenCalled();
    m.upsert.mockResolvedValue({ enabled: false });
    m.createMany.mockClear();
    await recordActivity("user-a", "presence");
    expect(m.createMany).not.toHaveBeenCalled();
  });
  it("OSS opt-out never touches storage; capture errors never fail the original operation", async () => {
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "false");
    await recordActivity("user-a", "presence");
    expect(m.upsert).not.toHaveBeenCalled();
    vi.stubEnv("ACHIEVEMENTS_ENABLED", "true");
    m.upsert.mockRejectedValue(new Error("unavailable"));
    expect(await recordActivity("user-a", "presence")).toBe(false);
  });
});
