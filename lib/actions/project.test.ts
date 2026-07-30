import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, updateProjectDefaults } from "./project";

const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";
const createdAt = new Date("2026-07-27T10:00:00.000Z");
const updatedAt = new Date("2026-07-27T11:00:00.000Z");

const mocks = vi.hoisted(() => {
  const prisma = {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn(), updateMany: vi.fn() },
    project: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  };

  return {
    authorize: vi.fn(),
    getProjectDepthDecreaseWarning: vi.fn(),
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/alerts/depth-conflict.server", () => ({
  getProjectDepthDecreaseWarning: mocks.getProjectDepthDecreaseWarning,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

function mockActor() {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role: "member" }],
    role: "member",
  });
}

describe("project actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mockActor();
    mocks.prisma.project.create.mockImplementation(({ data }) =>
      Promise.resolve({
        domain: data.domain,
        id: "project_1",
        name: data.name,
        publicId: data.publicId,
        trackingScope: data.trackingScope,
      }),
    );
    mocks.prisma.project.count.mockResolvedValue(0);
    mocks.writeAudit.mockResolvedValue({});
    mocks.getProjectDepthDecreaseWarning.mockResolvedValue(null);
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
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: PROJECT_PUBLIC_ID,
    });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.projectDefaults.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        city: null,
        country: null,
        createdAt,
        cronExpression: null,
        device: null,
        frequency: "daily",
        id: "defaults_1",
        inspectionDailyLimit: 50,
        jitterMinutes: 60,
        lastCheckedAt: null,
        locationKey: null,
        nextCheckAt: null,
        projectId: "project_1",
        serpDepth: 100,
        serpStopOnMatch: true,
        timezone: "UTC",
        updatedAt,
        ...create,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid project input before reading the session", async () => {
    await expect(createProject({ domain: "bad", name: "" })).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("persists the provided tracking scope on project creation", async () => {
    const result = await createProject({
      domain: "https://Example.com/",
      name: "Example",
      trackingScope: "country",
    });

    expect(mocks.prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          domain: "example.com",
          name: "Example",
          trackingScope: "country",
        }),
      }),
    );
    expect(result).toMatchObject({ trackingScope: "country" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project.create",
        after: expect.objectContaining({ trackingScope: "country" }),
      }),
      mocks.prisma,
    );
  });

  it("defaults tracking scope to country when callers omit it", async () => {
    await createProject({ domain: "example.com", name: "Example" });

    expect(mocks.prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trackingScope: "country" }),
      }),
    );
  });

  it("allows UI project creation exactly at the configured account limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "2");
    mocks.prisma.project.count.mockResolvedValue(1);

    await expect(createProject({ domain: "example.com", name: "Example" })).resolves.toMatchObject({
      name: "Example",
    });
    expect(mocks.prisma.project.create).toHaveBeenCalledOnce();
  });

  it("rejects UI project creation with an actionable message at the account limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "1");
    mocks.prisma.project.count.mockResolvedValue(1);

    await expect(createProject({ domain: "example.com", name: "Example" })).rejects.toThrow(
      "This account is limited to 1 project. Delete a project before creating another.",
    );
    expect(mocks.prisma.project.create).not.toHaveBeenCalled();
  });

  it("leaves UI project creation unlimited when the account cap is zero", async () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "0");

    await createProject({ domain: "example.com", name: "Example" });

    expect(mocks.prisma.project.count).not.toHaveBeenCalled();
    expect(mocks.prisma.project.create).toHaveBeenCalledOnce();
  });

  it("updates project defaults and moves the current default keyword market", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { device: "desktop", id: "kw_1", location: "United States", text: "rank tracker" },
      { device: "desktop", id: "kw_2", location: "US", text: "seo tool" },
      { device: "mobile", id: "kw_3", location: "Germany", text: "rank tracker" },
    ]);

    const result = await updateProjectDefaults({
      country: "DE",
      cronExpression: null,
      device: "mobile",
      frequency: "weekly",
      jitterMinutes: 30,
      projectId: PROJECT_PUBLIC_ID,
      timezone: "Europe/Berlin",
    });

    expect(result).toMatchObject({ frequency: "weekly", projectId: PROJECT_PUBLIC_ID });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
    expect(JSON.stringify(result)).not.toContain("project_1");
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          country: "Germany",
          device: "mobile",
          frequency: "weekly",
          locationKey: "DE",
          projectId: "project_1",
          serpDepth: 100,
        }),
        update: expect.objectContaining({
          country: "Germany",
          device: "mobile",
          frequency: "weekly",
          locationKey: "DE",
          serpDepth: 100,
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
        action: "project_defaults.update",
        after: expect.objectContaining({
          movedKeywords: 1,
          schedule: expect.not.objectContaining({
            createdAt: expect.anything(),
            id: expect.anything(),
            projectId: expect.anything(),
            updatedAt: expect.anything(),
          }),
          skippedConflicts: 1,
        }),
      }),
    );
    const audit = mocks.writeAudit.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(audit)).not.toContain("defaults_1");
  });

  it("returns a server warning when lowering depth affects alerts", async () => {
    mocks.getProjectDepthDecreaseWarning.mockResolvedValue(
      "alerts deeper than 20 will not fire. Affected alerts: Top 50.",
    );

    const result = await updateProjectDefaults({
      country: "DE",
      cronExpression: null,
      device: "mobile",
      frequency: "weekly",
      jitterMinutes: 30,
      projectId: PROJECT_PUBLIC_ID,
      serpDepth: 20,
      timezone: "Europe/Berlin",
    });

    expect(result.warning).toContain("Affected alerts: Top 50");
    expect(mocks.getProjectDepthDecreaseWarning).toHaveBeenCalledWith("project_1", 20);
  });
});
