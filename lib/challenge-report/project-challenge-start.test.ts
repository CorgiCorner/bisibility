import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  checkInCreate: vi.fn(),
  challengeCreate: vi.fn(),
  enabled: vi.fn(),
  findUnique: vi.fn(),
  membership: vi.fn(),
  state: vi.fn(),
  transaction: vi.fn(),
  writeBaseline: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: m.transaction,
    achievementState: { findUnique: m.state },
    projectSeoChallenge: { findUnique: m.findUnique },
  },
}));
vi.mock("@/lib/pages/snapshot", () => ({
  baselinePageMembership: m.membership,
  writeBaselinePageSnapshot: m.writeBaseline,
}));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  readSearchInsightsConnection: async () => ({ connection: null }),
}));
vi.mock("./feature", () => ({ projectSeoChallengeEnabled: m.enabled }));

import { readProjectChallenge, startProjectChallenge } from "./project-challenge";

const tx = {
  projectSeoChallenge: { create: m.challengeCreate },
  projectSeoChallengeCheckIn: { create: m.checkInCreate },
};
const input = { projectId: "project-1", userId: "user-1" };

describe("project challenge start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    m.enabled.mockResolvedValue(true);
    m.state.mockResolvedValue({ enabled: true, timeZone: "Europe/Warsaw" });
    m.findUnique.mockResolvedValue(null);
    m.membership.mockResolvedValue({ ids: ["page-1", "page-2"], source: "sitemap" });
    m.writeBaseline.mockResolvedValue({ id: "baseline-1" });
    m.challengeCreate.mockResolvedValue({ id: "challenge-1" });
    m.transaction.mockImplementation((work: (client: typeof tx) => unknown) => work(tx));
  });

  it("writes its own baseline, the enrollment and the Day 1 check-in in one transaction", async () => {
    await startProjectChallenge(input);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(m.writeBaseline).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ projectId: "project-1", takenOn: "2026-10-20" }),
    );
    expect(m.challengeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ joinedOn: "2026-10-20", snapshotId: "baseline-1" }),
      select: { id: true },
    });
    expect(m.checkInCreate).toHaveBeenCalledWith({
      data: { challengeId: "challenge-1", localDay: "2026-10-20", source: "start" },
    });
  });

  it("uses the browser's local day when no activity time zone has been set", async () => {
    vi.setSystemTime(new Date("2026-10-20T02:00:00Z"));
    m.state.mockResolvedValue(null);
    await startProjectChallenge({ ...input, timeZone: "America/Los_Angeles" });
    expect(m.challengeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ joinedOn: "2026-10-19", timeZone: "America/Los_Angeles" }),
      select: { id: true },
    });
  });

  it("keeps a concurrent enrollment when a racing Start loses, and rethrows other failures", async () => {
    m.transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", { clientVersion: "test", code: "P2002" }),
    );
    await expect(startProjectChallenge(input)).resolves.toBeNull();
    m.transaction.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(startProjectChallenge(input)).rejects.toThrow("database unavailable");
  });

  it("does not start while activity tracking is off or the instance feature is disabled", async () => {
    m.state.mockResolvedValueOnce({ enabled: false });
    expect(await startProjectChallenge(input)).toBeNull();
    m.enabled.mockResolvedValueOnce(false);
    expect(await startProjectChallenge(input)).toBeNull();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("reads a legacy paused enrollment inside its window and counts its work days", async () => {
    m.findUnique.mockResolvedValue({
      baselineClicks: null,
      checkIns: [{ localDay: "2026-10-03" }],
      days: [{ localDay: "2026-10-02" }, { localDay: "2026-10-03" }],
      joinedOn: "2026-10-01",
      pausedAt: new Date("2026-10-04T00:00:00Z"),
      snapshot: { pageCount: 4, takenOn: new Date("2026-09-30T00:00:00Z") },
      snapshotId: "old-active-snapshot",
      timeZone: "UTC",
    });
    const challenge = await readProjectChallenge("user-1", "project-1");
    expect(challenge).toMatchObject({
      progress: { checkInCount: 2, elapsedDays: 20, ended: false },
      snapshotId: "old-active-snapshot",
      workDays: 2,
    });
  });
});
