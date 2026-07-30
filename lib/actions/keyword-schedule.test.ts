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
    keywordSchedule: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  };

  return {
    AuthorizationError,
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
    expect(mocks.prisma.keywordSchedule.upsert).not.toHaveBeenCalled();
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
    const upsert = mocks.prisma.keywordSchedule.upsert.mock.calls[0][0];
    const expectedNextCheck = computeNextCheckAt(
      { frequency: "daily", jitterMinutes: 0 },
      new Date("2026-01-01T06:00:00.000Z"),
      "keyword_1",
    );

    expect(upsert.where).toEqual({ keywordId: "keyword_1" });
    expect(upsert.create).toMatchObject({
      frequency: "daily",
      keywordId: "keyword_1",
      serpDepth: 20,
    });
    expect(upsert.update).toMatchObject({ frequency: "daily", serpDepth: 20 });
    expect(upsert.create.nextCheckAt).toEqual(expectedNextCheck);
    expect(upsert.update.nextCheckAt).toEqual(expectedNextCheck);
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
      appPath("[project]", "keywords", "[id]"),
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
    const upsert = mocks.prisma.keywordSchedule.upsert.mock.calls[0][0];

    expect(upsert.update).toMatchObject({
      frequency: "paused",
      nextCheckAt: null,
    });
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
});
