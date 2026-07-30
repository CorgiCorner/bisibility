import { appPath } from "@/lib/routing/app-path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runManualProjectCheck,
  updateDefaultRankCheckSettings,
  updateProjectDetails,
  updateProjectTrackingScope,
  updateRankCheckFrequency,
} from "./settings";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor(readonly code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.name = "AuthorizationError";
    }
  }
  const roleRank = { admin: 2, auditor: 0.5, member: 1, owner: 3, viewer: 0 };
  const minimumRoleByAction = {
    create: "member",
    delete: "admin",
    manage: "admin",
    read: "viewer",
    update: "member",
  } as const;
  const prisma = {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn(), updateMany: vi.fn() },
    project: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  };

  return {
    AuthorizationError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) {
        throw new AuthorizationError("unauthenticated");
      }
      const role = actor.memberships?.find(
        (item: { projectId: string }) => item.projectId === resource.projectId,
      )?.role;
      const requiredRole = (resource.requiredRole ??
        minimumRoleByAction[action as keyof typeof minimumRoleByAction]) as keyof typeof roleRank;
      if (!role || roleRank[role as keyof typeof roleRank] < roleRank[requiredRole]) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    runCheckNow: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));
vi.mock("./rankCheck", () => ({ runCheckNow: mocks.runCheckNow }));

function mockActor(role: "admin" | "member" | "viewer" = "member") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

function mockProject() {
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: "prj_abcdefghijklmnopqrstuvwx",
  });
}

function scheduleInput(overrides: Record<string, unknown> = {}) {
  return {
    country: "Germany",
    cronExpression: "0 6 * * *",
    device: "mobile",
    frequency: "weekly",
    jitterMinutes: 60,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    timezone: "UTC",
    ...overrides,
  };
}

describe("settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mockProject();
    mocks.writeAudit.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.keyword.updateMany.mockResolvedValue({ count: 0 });
    mocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: {
        canonicalKey: "DE",
        cityName: null,
        countryCode: "DE",
        displayName: "Germany",
        id: "loc_de",
        kind: "country",
      },
      warning: null,
    });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.projectDefaults.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        id: "defaults_1",
        inspectionDailyLimit: 50,
        serpDepth: 100,
        serpStopOnMatch: true,
        updatedAt: new Date("2026-07-02T00:00:00.000Z"),
        ...create,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid project details before reading the session", async () => {
    await expect(
      updateProjectDetails({ domain: "bad", name: "", projectId: "prj_abcdefghijklmnopqrstuvwx" }),
    ).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("updates project details with normalized domain and writes an audit record", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      domain: "old.example",
      name: "Old",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "global",
    });
    mocks.prisma.project.update.mockImplementation(({ data }) =>
      Promise.resolve({
        trackingScope: "global",
        ...data,
        publicId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );

    const result = await updateProjectDetails({
      domain: "https://Example.com/",
      name: "Example",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(mocks.prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { domain: "example.com", name: "Example" } }),
    );
    expect(result).toMatchObject({
      domain: "example.com",
      name: "Example",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "country",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings.project_details.update" }),
    );
  });

  it("persists tracking scope with manage authorization and audit", async () => {
    mockActor("admin");
    mocks.prisma.project.findUnique.mockResolvedValue({
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "global",
    });
    mocks.prisma.project.update.mockResolvedValue({
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "city",
    });

    const result = await updateProjectTrackingScope({
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "city",
    });

    expect(mocks.prisma.project.update).toHaveBeenCalledWith({
      data: { trackingScope: "city" },
      select: { publicId: true, trackingScope: true },
      where: { id: "project_1" },
    });
    expect(result).toEqual({ projectId: "prj_abcdefghijklmnopqrstuvwx", trackingScope: "city" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.project_tracking_scope.update",
        after: { publicId: "prj_abcdefghijklmnopqrstuvwx", trackingScope: "city" },
        before: { publicId: "prj_abcdefghijklmnopqrstuvwx", trackingScope: "global" },
      }),
    );
  });

  it("requires admin access to update tracking scope", async () => {
    mockActor("member");

    await expect(
      updateProjectTrackingScope({
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        trackingScope: "country",
      }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  });

  it("updates schedule defaults and moves the current default keyword market", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { device: "desktop", id: "kw_1", location: "United States", text: "rank tracker" },
      { device: "desktop", id: "kw_2", location: "United States", text: "seo tool" },
      { device: "mobile", id: "kw_3", location: "Germany", text: "rank tracker" },
    ]);

    const result = await updateDefaultRankCheckSettings(scheduleInput());

    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          city: null,
          country: "Germany",
          device: "mobile",
          frequency: "weekly",
          locationKey: "DE",
          projectId: "project_1",
        }),
        update: expect.objectContaining({
          city: null,
          country: "Germany",
          device: "mobile",
          frequency: "weekly",
          locationKey: "DE",
        }),
      }),
    );
    const upsert = mocks.prisma.projectDefaults.upsert.mock.calls[0]?.[0];
    expect(upsert?.create).not.toHaveProperty("serpStopOnMatch");
    expect(upsert?.update).not.toHaveProperty("serpStopOnMatch");
    expect(mocks.prisma.keyword.updateMany).toHaveBeenCalledWith({
      data: { device: "mobile", location: "Germany", locationId: "loc_de" },
      where: { id: { in: ["kw_2"] } },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.defaults.update",
        after: expect.objectContaining({
          market: { city: null, country: "Germany", device: "mobile", locationKey: "DE" },
          movedKeywords: 1,
          schedule: expect.objectContaining({
            device: "mobile",
            frequency: "weekly",
            inspectionDailyLimit: 50,
          }),
          skippedConflicts: 1,
        }),
      }),
    );
    const audit = mocks.writeAudit.mock.calls.at(-1)?.[0];
    expect(audit.after.schedule).not.toHaveProperty("id");
    expect(audit.after.schedule).not.toHaveProperty("projectId");
    expect(audit.after.schedule).not.toHaveProperty("createdAt");
    expect(audit.after.schedule).not.toHaveProperty("updatedAt");
    expect(result).toMatchObject({
      device: "mobile",
      frequency: "weekly",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledTimes(1);
  });

  it("persists the project stop-on-match setting", async () => {
    await updateDefaultRankCheckSettings(scheduleInput({ serpStopOnMatch: false }));

    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ serpStopOnMatch: false }),
        update: expect.objectContaining({ serpStopOnMatch: false }),
      }),
    );
  });

  it("moves city default keywords by canonical location key", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      city: "Austin, Texas, United States",
      country: "United States",
      cronExpression: null,
      device: "desktop",
      frequency: "daily",
      jitterMinutes: 60,
      lastCheckedAt: null,
      locationKey: "US/Texas/Austin",
      nextCheckAt: null,
      projectId: "project_1",
      timezone: "UTC",
    });
    const austinRef = {
      canonicalKey: "US/Texas/Austin",
      cityName: "Austin",
      countryCode: "US",
      displayName: "Austin, Texas, United States",
      kind: "city",
    };
    const dallasRef = {
      canonicalKey: "US/Texas/Dallas",
      cityName: "Dallas",
      countryCode: "US",
      displayName: "Dallas, Texas, United States",
      kind: "city",
    };
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        device: "desktop",
        id: "kw_1",
        location: "Austin, Texas, United States",
        locationRef: austinRef,
        text: "rank tracker",
      },
      {
        device: "desktop",
        id: "kw_2",
        location: "Austin, Texas, United States",
        locationRef: austinRef,
        text: "seo tool",
      },
      {
        device: "mobile",
        id: "kw_3",
        location: "Dallas, Texas, United States",
        locationRef: dallasRef,
        text: "rank tracker",
      },
    ]);
    mocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: {
        ...dallasRef,
        id: "loc_dallas",
      },
      warning: null,
    });

    await updateDefaultRankCheckSettings(
      scheduleInput({ device: "mobile", locationKey: "US/Texas/Dallas" }),
    );

    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith({
      select: expect.objectContaining({
        locationRef: expect.anything(),
      }),
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.keyword.updateMany).toHaveBeenCalledWith({
      data: {
        device: "mobile",
        location: "Dallas, Texas, United States",
        locationId: "loc_dallas",
      },
      where: { id: { in: ["kw_2"] } },
    });
  });

  it("persists an explicit default market even when no keywords move", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([]);

    await updateDefaultRankCheckSettings(scheduleInput());

    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      country: "Germany",
      projectId: "project_1",
    });
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          city: null,
          country: "Germany",
          device: "mobile",
          locationKey: "DE",
        }),
        update: expect.objectContaining({
          city: null,
          country: "Germany",
          device: "mobile",
          locationKey: "DE",
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          market: { city: null, country: "Germany", device: "mobile", locationKey: "DE" },
          movedKeywords: 0,
        }),
      }),
    );
  });

  it("updates only the project frequency when called from the frequency control", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      city: null,
      country: "Germany",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      cronExpression: null,
      device: "mobile",
      frequency: "weekly",
      id: "defaults_1",
      inspectionDailyLimit: 50,
      jitterMinutes: 60,
      lastCheckedAt: null,
      locationKey: "DE",
      nextCheckAt: null,
      projectId: "project_1",
      serpDepth: 100,
      serpStopOnMatch: true,
      timezone: "UTC",
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    const result = await updateRankCheckFrequency(
      scheduleInput({ country: "United States", device: "desktop" }),
    );

    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.rank_check_frequency.update",
        after: expect.not.objectContaining({
          createdAt: expect.anything(),
          id: expect.anything(),
          projectId: expect.anything(),
          updatedAt: expect.anything(),
        }),
        before: expect.not.objectContaining({
          createdAt: expect.anything(),
          id: expect.anything(),
          projectId: expect.anything(),
          updatedAt: expect.anything(),
        }),
      }),
    );
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
    expect(result.projectId).toBe("prj_abcdefghijklmnopqrstuvwx");
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledTimes(1);
  });

  it("revalidates only settings, keywords, and audit views after settings mutations", async () => {
    await updateRankCheckFrequency(scheduleInput({ country: "United States", device: "desktop" }));

    expect(mocks.revalidatePath.mock.calls).toEqual([
      [appPath("[project]", "settings"), "page"],
      [appPath("[project]", "keywords"), "page"],
      [appPath("[project]", "settings", "audit"), "page"],
    ]);
  });

  it("runs manual project checks with bounded concurrency and returns honest start totals", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({ publicId: `kw_${index + 1}` })),
    );
    let active = 0;
    let maxActive = 0;
    mocks.runCheckNow.mockImplementation(async ({ keywordId }: { keywordId: string }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (keywordId === "kw_3") {
        throw new Error("check failed");
      }
      return { status: "running" };
    });

    const result = await runManualProjectCheck({ projectId: "prj_abcdefghijklmnopqrstuvwx" });

    expect(result).toEqual({ failed: 1, queued: 5, total: 6 });
    expect(mocks.runCheckNow).toHaveBeenCalledTimes(6);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.run_check_now",
        after: { failed: 1, queued: 5, total: 6 },
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "checks"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "alerts"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "competitors"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "settings"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "settings", "audit"),
      "page",
    );
  });

  it("stops scheduling project checks after the budget is exhausted", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({ publicId: `kw_${index + 1}` })),
    );
    mocks.runCheckNow.mockImplementation(async ({ keywordId }: { keywordId: string }) => {
      if (keywordId === "kw_1") {
        return {
          code: "budget_exhausted",
          message: "Rank check monthly budget reached.",
          status: "not_started",
        };
      }
      await Promise.resolve();
      return { status: "running" };
    });

    const result = await runManualProjectCheck({ projectId: "prj_abcdefghijklmnopqrstuvwx" });

    expect(result).toEqual({
      failed: 5,
      queued: 3,
      reason: "budget_exhausted",
      total: 8,
    });
    expect(mocks.runCheckNow).toHaveBeenCalledTimes(4);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.run_check_now",
        after: result,
      }),
    );
  });
});
