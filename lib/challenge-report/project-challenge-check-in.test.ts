import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createMany: vi.fn(),
  enabled: vi.fn(),
  findUnique: vi.fn(),
  state: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    achievementState: { findUnique: m.state },
    projectSeoChallenge: { findUnique: m.findUnique },
    projectSeoChallengeCheckIn: { createMany: m.createMany },
  },
}));
vi.mock("./feature", () => ({ projectSeoChallengeEnabled: m.enabled }));

import {
  markProjectChallengeDay,
  readChallengeVisitTimeZone,
  recordProjectChallengeVisit,
} from "./project-challenge-check-in";

const row = { id: "challenge-1", joinedOn: "2026-10-20", timeZone: "Pacific/Auckland" };

describe("project challenge check-ins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.enabled.mockResolvedValue(true);
    m.findUnique.mockResolvedValue(row);
    m.state.mockResolvedValue({ enabled: true });
    m.createMany.mockResolvedValue({ count: 1 });
  });

  it("checks in the enrollment-zone day on entry and is idempotent on repeats", async () => {
    // 2026-10-20T12:00Z is already 2026-10-21 in Auckland.
    const at = new Date("2026-10-20T12:00:00Z");
    expect(await recordProjectChallengeVisit("user-1", "project-1", at)).toBe("recorded");
    expect(m.createMany).toHaveBeenCalledWith({
      data: [{ challengeId: "challenge-1", localDay: "2026-10-21", source: "visit" }],
      skipDuplicates: true,
    });
    m.createMany.mockResolvedValue({ count: 0 });
    expect(await recordProjectChallengeVisit("user-1", "project-1", at)).toBe("existing");
  });

  it("does not record a visit after the window, without enrollment, or when switched off", async () => {
    const late = new Date("2026-11-19T12:00:00Z");
    expect(await recordProjectChallengeVisit("user-1", "project-1", late)).toBe("skipped");
    m.findUnique.mockResolvedValueOnce(null);
    expect(await recordProjectChallengeVisit("user-1", "project-1")).toBe("skipped");
    m.enabled.mockResolvedValueOnce(false);
    expect(await recordProjectChallengeVisit("user-1", "project-1")).toBe("skipped");
    m.state.mockResolvedValueOnce({ enabled: false });
    expect(await recordProjectChallengeVisit("user-1", "project-1")).toBe("skipped");
    expect(m.createMany).not.toHaveBeenCalled();
  });

  it("marks past window days, rejects future and out-of-window days, and corrects after the end", async () => {
    const at = new Date("2026-10-25T01:00:00Z"); // 2026-10-25 in Auckland
    expect(await markProjectChallengeDay("user-1", "project-1", "2026-10-26", at)).toBe("invalid");
    expect(await markProjectChallengeDay("user-1", "project-1", "2026-10-19", at)).toBe("invalid");
    expect(await markProjectChallengeDay("user-1", "project-1", "2026-10-22", at)).toBe("recorded");
    expect(m.createMany).toHaveBeenLastCalledWith({
      data: [{ challengeId: "challenge-1", localDay: "2026-10-22", source: "manual" }],
      skipDuplicates: true,
    });
    const afterEnd = new Date("2027-01-05T01:00:00Z");
    expect(await markProjectChallengeDay("user-1", "project-1", "2026-11-18", afterEnd)).toBe(
      "recorded",
    );
    expect(await markProjectChallengeDay("user-1", "project-1", "2026-11-19", afterEnd)).toBe(
      "invalid",
    );
  });

  it("mounts the visit hook only while the window is open, keyed to the enrollment zone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T09:00:00Z"));
    expect(await readChallengeVisitTimeZone("user-1", "project-1")).toBe("Pacific/Auckland");
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z")); // 2026-11-19 in Auckland
    expect(await readChallengeVisitTimeZone("user-1", "project-1")).toBeNull();
    vi.useRealTimers();
  });
});
