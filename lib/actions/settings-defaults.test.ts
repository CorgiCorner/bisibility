import {
  getSettingsActionMocks,
  resetSettingsActionMocks,
  settingsScheduleInput,
} from "@/lib/actions/settings-test-harness";
import { appPath } from "@/lib/routing/app-path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const settingsActionMocks = getSettingsActionMocks();
let actions: typeof import("@/lib/actions/settings");

beforeAll(async () => {
  actions = await import("@/lib/actions/settings");
});

describe("settings default actions", () => {
  beforeEach(resetSettingsActionMocks);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("updates schedule defaults and moves the current default keyword market", async () => {
    settingsActionMocks.prisma.keyword.findMany.mockResolvedValue([
      { device: "desktop", id: "kw_1", location: "United States", text: "rank tracker" },
      { device: "desktop", id: "kw_2", location: "United States", text: "seo tool" },
      { device: "mobile", id: "kw_3", location: "Germany", text: "rank tracker" },
    ]);

    const result = await actions.updateDefaultRankCheckSettings(settingsScheduleInput());

    expect(settingsActionMocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
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
    const upsert = settingsActionMocks.prisma.projectDefaults.upsert.mock.calls[0]?.[0];
    expect(upsert?.create).not.toHaveProperty("serpStopOnMatch");
    expect(upsert?.update).not.toHaveProperty("serpStopOnMatch");
    expect(settingsActionMocks.prisma.keyword.updateMany).toHaveBeenCalledWith({
      data: { device: "mobile", location: "Germany", locationId: "loc_de" },
      where: { id: { in: ["kw_2"] } },
    });
    expect(settingsActionMocks.writeAudit).toHaveBeenCalledWith(
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
    const audit = settingsActionMocks.writeAudit.mock.calls.at(-1)?.[0];
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
    expect(settingsActionMocks.prisma.projectDefaults.upsert).toHaveBeenCalledTimes(1);
  });

  it("persists the project stop-on-match setting", async () => {
    await actions.updateDefaultRankCheckSettings(settingsScheduleInput({ serpStopOnMatch: false }));

    expect(settingsActionMocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ serpStopOnMatch: false }),
        update: expect.objectContaining({ serpStopOnMatch: false }),
      }),
    );
  });

  it("moves city default keywords by canonical location key", async () => {
    settingsActionMocks.prisma.projectDefaults.findUnique.mockResolvedValue({
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
    settingsActionMocks.prisma.keyword.findMany.mockResolvedValue([
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
    settingsActionMocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: { ...dallasRef, id: "loc_dallas" },
      warning: null,
    });

    await actions.updateDefaultRankCheckSettings(
      settingsScheduleInput({ device: "mobile", locationKey: "US/Texas/Dallas" }),
    );

    expect(settingsActionMocks.prisma.keyword.findMany).toHaveBeenCalledWith({
      select: expect.objectContaining({ locationRef: expect.anything() }),
      where: { projectId: "project_1" },
    });
    expect(settingsActionMocks.prisma.keyword.updateMany).toHaveBeenCalledWith({
      data: {
        device: "mobile",
        location: "Dallas, Texas, United States",
        locationId: "loc_dallas",
      },
      where: { id: { in: ["kw_2"] } },
    });
  });

  it("persists an explicit default market even when no keywords move", async () => {
    settingsActionMocks.prisma.keyword.findMany.mockResolvedValue([]);

    await actions.updateDefaultRankCheckSettings(settingsScheduleInput());

    expect(settingsActionMocks.resolveKeywordLocation).toHaveBeenCalledWith({
      country: "Germany",
      projectId: "project_1",
    });
    expect(settingsActionMocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
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
    expect(settingsActionMocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          market: { city: null, country: "Germany", device: "mobile", locationKey: "DE" },
          movedKeywords: 0,
        }),
      }),
    );
  });

  it("updates only the project frequency when called from the frequency control", async () => {
    settingsActionMocks.prisma.projectDefaults.findUnique.mockResolvedValue({
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

    const result = await actions.updateRankCheckFrequency(
      settingsScheduleInput({ country: "United States", device: "desktop" }),
    );

    expect(settingsActionMocks.prisma.projectDefaults.upsert).toHaveBeenCalledTimes(1);
    expect(settingsActionMocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
    expect(settingsActionMocks.writeAudit).toHaveBeenCalledWith(
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
    expect(settingsActionMocks.prisma.projectDefaults.upsert).toHaveBeenCalledTimes(1);
  });

  it("revalidates only settings, keywords, and audit views after settings mutations", async () => {
    await actions.updateRankCheckFrequency(
      settingsScheduleInput({ country: "United States", device: "desktop" }),
    );

    expect(settingsActionMocks.revalidatePath.mock.calls).toEqual([
      [appPath("[project]", "settings"), "page"],
      [appPath("[project]", "rank-tracker"), "page"],
      [appPath("[project]", "settings", "audit"), "page"],
    ]);
  });
});
