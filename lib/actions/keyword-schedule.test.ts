import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import { appPath } from "@/lib/routing/app-path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateKeywordSchedule } from "./keyword-schedule";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor(readonly code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.name = "AuthorizationError";
    }
  }
  const roleRank = { admin: 2, auditor: 0.5, member: 1, owner: 3, viewer: 0 };
  const prisma = {
    $transaction: vi.fn(),
    keyword: { findFirst: vi.fn() },
    keywordSchedule: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  };

  return {
    AuthorizationError,
    setKeywordCadence: vi.fn(),
    authorize: vi.fn((actor, _action, resource) => {
      if (!actor) throw new AuthorizationError("unauthenticated");
      const role = actor.memberships?.find(
        (item: { projectId: string }) => item.projectId === resource.projectId,
      )?.role;
      if (!role || roleRank[role as keyof typeof roleRank] < roleRank.member) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    getKeywordDepthDecreaseWarning: vi.fn(),
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/rank-check/schedules/keyword-cadence", () => ({
  setKeywordCadence: mocks.setKeywordCadence,
}));

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/alerts/depth-conflict.server", () => ({
  getKeywordDepthDecreaseWarning: mocks.getKeywordDepthDecreaseWarning,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

function mockActor(role: "member" | "viewer" = "member") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

function mockKeyword() {
  mocks.prisma.keyword.findFirst.mockResolvedValue({
    id: "keyword_1",
    project: { id: "project_1", publicId: "prj_a00000000000000000000000", writeMode: "active" },
    projectId: "project_1",
    publicId: "kw_a00000000000000000000000",
    text: "rank tracker",
  });
}

function scheduleInput(overrides: Record<string, unknown> = {}) {
  return {
    cronExpression: null,
    frequency: "daily",
    jitterMinutes: 0,
    keywordId: "kw_a00000000000000000000000",
    timezone: "UTC",
    ...overrides,
  };
}

describe("updateKeywordSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mockKeyword();
    mocks.writeAudit.mockResolvedValue({});
    mocks.setKeywordCadence.mockImplementation(async (_tx, _projectId, _ids, cadence) => {
      mocks.prisma.keywordSchedule.findUniqueOrThrow.mockResolvedValue({
        ...cadence,
        lastCheckedAt: null,
      });
      return new Map([
        [
          "keyword_1",
          cadence.frequency === "manual"
            ? null
            : {
                ...cadence,
                publicId: "sch_a00000000000000000000000",
                enabled: cadence.frequency !== "paused",
                timeOfDay: null,
              },
        ],
      ]);
    });
    mocks.getKeywordDepthDecreaseWarning.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma),
    );
  });

  it("returns a server warning that lists alerts affected by a lower depth", async () => {
    mocks.prisma.keywordSchedule.findUnique.mockResolvedValue(null);
    mocks.prisma.keywordSchedule.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create, lastCheckedAt: null }),
    );
    mocks.getKeywordDepthDecreaseWarning.mockResolvedValue(
      "alerts deeper than 20 will not fire. Affected alerts: Lost top 50.",
    );

    const result = await updateKeywordSchedule(scheduleInput({ serpDepth: 20 }));

    expect(result.warning).toContain("Affected alerts: Lost top 50");
    expect(mocks.getKeywordDepthDecreaseWarning).toHaveBeenCalledWith("keyword_1", 20);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects callers without keyword update access", async () => {
    mockActor("viewer");

    await expect(updateKeywordSchedule(scheduleInput())).rejects.toBeInstanceOf(
      mocks.AuthorizationError,
    );

    expect(mocks.prisma.keywordSchedule.findUnique).not.toHaveBeenCalled();
    expect(mocks.setKeywordCadence).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("creates a keyword schedule and audits the normalized next check", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T06:00:00.000Z"));
    mocks.prisma.keywordSchedule.findUnique.mockResolvedValue(null);
    mocks.prisma.keywordSchedule.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create, lastCheckedAt: null }),
    );

    const result = await updateKeywordSchedule(scheduleInput({ serpDepth: 20 }));
    const expectedNextCheck = computeNextCheckAt(
      { frequency: "daily", jitterMinutes: 0 },
      new Date("2026-01-01T06:00:00.000Z"),
      "keyword_1",
    );
    expect(mocks.setKeywordCadence).toHaveBeenCalledWith(
      mocks.prisma,
      "project_1",
      ["keyword_1"],
      expect.objectContaining({ frequency: "daily", serpDepth: 20 }),
      "user_1",
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "keyword_schedule.update",
        after: expect.objectContaining({ frequency: "daily" }),
        before: null,
        projectId: "project_1",
        targetId: "kw_a00000000000000000000000",
        targetType: "keyword_schedule",
      }),
    );
    expect(result).toMatchObject({
      frequency: "daily",
      next_check_at: expectedNextCheck?.toISOString(),
      serp_depth: 20,
      timezone: "UTC",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "rank-tracker", "[id]"),
      "page",
    );
  });

  it("updates an existing schedule and stores paused schedules without next checks", async () => {
    const before = {
      cronExpression: null,
      frequency: "daily",
      id: "schedule_1",
      jitterMinutes: 60,
      keywordId: "keyword_1",
      lastCheckedAt: null,
      nextCheckAt: new Date("2026-01-02T06:00:00.000Z"),
      timezone: "UTC",
    };
    mocks.prisma.keywordSchedule.findUnique.mockResolvedValue(before);
    mocks.prisma.keywordSchedule.upsert.mockImplementation(({ update }) =>
      Promise.resolve({ ...before, ...update }),
    );

    const result = await updateKeywordSchedule(scheduleInput({ frequency: "paused" }));
    expect(mocks.setKeywordCadence).toHaveBeenCalledWith(
      mocks.prisma,
      "project_1",
      ["keyword_1"],
      expect.objectContaining({ frequency: "paused", nextCheckAt: null }),
      "user_1",
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ frequency: "paused" }),
        before,
      }),
    );
    expect(result).toMatchObject({
      frequency: "paused",
      next_check_at: null,
    });
  });
  it("returns the real current membership slot instead of the stored legacy phase", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T06:00:00Z"));
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_3",
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      project: { id: "project_1", publicId: "prj_a00000000000000000000000", writeMode: "active" },
    });
    mocks.prisma.keywordSchedule.findUnique.mockResolvedValue(null);
    mocks.setKeywordCadence.mockImplementationOnce(async () => {
      mocks.prisma.keywordSchedule.findUniqueOrThrow.mockResolvedValue({
        frequency: "weekly",
        cronExpression: null,
        jitterMinutes: 0,
        lastCheckedAt: null,
        nextCheckAt: new Date("2099-01-01"),
        timezone: "UTC",
        serpDepth: 50,
      });
      return new Map([
        [
          "keyword_3",
          {
            frequency: "weekly",
            cronExpression: null,
            enabled: true,
            jitterMinutes: 0,
            publicId: "sch_a00000000000000000000003",
            timeOfDay: null,
            timezone: "UTC",
          },
        ],
      ]);
    });
    expect(await updateKeywordSchedule(scheduleInput({ frequency: "weekly" }))).toMatchObject({
      frequency: "weekly",
      next_check_at: "2026-10-23T23:05:55.000Z",
    });
  });
});
