import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  upsertState: vi.fn(),
  findEnrollment: vi.fn(),
  upsertEnrollment: vi.fn(),
  updateEnrollment: vi.fn(),
  audit: vi.fn(),
  enabled: true,
  demo: "disabled" as "disabled" | "read_only",
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    achievementState: { upsert: m.upsertState },
    achievementEnrollment: {
      findUnique: m.findEnrollment,
      upsert: m.upsertEnrollment,
      update: m.updateEnrollment,
    },
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ publicId: "usr_a" }) },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: m.audit }));
vi.mock("./config", () => ({ achievementsEnabled: () => m.enabled }));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: () => ({ kind: m.demo }) }));

import { joinThirtyDays, leaveThirtyDays } from "./thirty-days-enrollment";

describe("30-day enrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T23:30:00Z"));
    m.enabled = true;
    m.demo = "disabled";
    m.upsertState.mockResolvedValue({ enabled: true, timeZone: "Europe/Warsaw" });
    m.findEnrollment.mockResolvedValue(null);
  });
  it("joins on the zoned day and does not write when tracking or the demo blocks it", async () => {
    const committed = vi.fn();
    expect(await joinThirtyDays("user-a", committed)).toEqual({
      kind: "joined",
      joinedOn: "2026-11-08",
    });
    expect(m.upsertEnrollment.mock.calls[0][0].create).toMatchObject({
      userId: "user-a",
      kind: "thirty_days",
      definitionVersion: 1,
      joinedOn: "2026-11-08",
      leftAt: null,
      timeZone: "Europe/Warsaw",
    });
    expect(committed).toHaveBeenCalledOnce();
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.achievements_thirty_days",
        after: { joined: true, day: "2026-11-08" },
      }),
    );
    m.upsertState.mockResolvedValue({ enabled: false, timeZone: "UTC" });
    expect(await joinThirtyDays("user-a")).toEqual({ kind: "tracking_off" });
    m.enabled = false;
    expect(await joinThirtyDays("user-a")).toEqual({ kind: "disabled" });
    m.enabled = true;
    m.demo = "read_only";
    expect(await leaveThirtyDays("user-a")).toEqual({ kind: "disabled" });
    expect(m.updateEnrollment).not.toHaveBeenCalled();
  });
  it("leaves once and a later join keeps the original Day 1", async () => {
    m.findEnrollment.mockResolvedValueOnce(null).mockResolvedValueOnce({
      joinedOn: "2026-11-08",
      leftAt: null,
      timeZone: "Europe/Warsaw",
    });
    await joinThirtyDays("user-a");
    expect(await leaveThirtyDays("user-a")).toEqual({ kind: "left", leftOn: "2026-11-08" });
    expect(m.updateEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ data: { leftAt: new Date("2026-11-07T23:30:00Z") } }),
    );
    m.findEnrollment.mockResolvedValue({
      joinedOn: "2026-11-08",
      leftAt: new Date("2026-11-07T23:30:00Z"),
      timeZone: "Europe/Warsaw",
    });
    expect(await joinThirtyDays("user-a")).toMatchObject({
      kind: "joined",
      joinedOn: "2026-11-08",
    });
    expect(m.upsertEnrollment.mock.calls.at(-1)?.[0].update).toEqual({ leftAt: null });
    expect(m.upsertEnrollment.mock.calls.at(-1)?.[0].create.joinedOn).toBe("2026-11-08");
  });
});
