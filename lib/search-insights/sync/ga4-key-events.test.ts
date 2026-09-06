import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  readConfigured: vi.fn(),
  resolveConnection: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findMany: mocks.findMany },
    searchAnalyticsImport: { update: mocks.update },
  },
}));
vi.mock("@/lib/providers/analytics/ga4-admin", () => ({
  readGa4KeyEventsConfigured: mocks.readConfigured,
}));
vi.mock("@/lib/search-insights/sync/sessions-credentials", () => ({
  ORGANIC_SESSIONS_SOURCE: "ga4",
  resolveOrganicSessionsConnection: mocks.resolveConnection,
}));

const { cacheGa4KeyEventsConfiguration, cacheGa4KeyEventsConfigurationsForAllProjects } =
  await import("./ga4-key-events");

const input = {
  credentials: { apiKey: "refresh_token", login: "123456789" },
  now: new Date("2026-09-02T10:15:00.000Z"),
  projectId: "project_1",
  property: "123456789",
};

describe("GA4 key events configuration cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue(undefined);
  });

  it("stores a known configuration with the check timestamp", async () => {
    mocks.readConfigured.mockResolvedValue(true);

    await expect(cacheGa4KeyEventsConfiguration(input)).resolves.toBe(true);

    expect(mocks.update).toHaveBeenCalledWith({
      data: {
        keyEventsCheckedAt: input.now,
        keyEventsConfigured: true,
      },
      where: {
        projectId_property_source: {
          projectId: "project_1",
          property: "123456789",
          source: "ga4",
        },
      },
    });
  });

  it.each([true, false])("keeps a cached %s value when listing is unknown", async (cached) => {
    const stored = {
      keyEventsCheckedAt: new Date("2026-09-01T10:15:00.000Z"),
      keyEventsConfigured: cached,
    };
    mocks.readConfigured.mockResolvedValue(null);
    mocks.update.mockImplementation(async ({ data }) => Object.assign(stored, data));

    await expect(cacheGa4KeyEventsConfiguration(input)).resolves.toBeNull();

    expect(mocks.update).not.toHaveBeenCalled();
    expect(stored).toEqual({
      keyEventsCheckedAt: new Date("2026-09-01T10:15:00.000Z"),
      keyEventsConfigured: cached,
    });
  });

  it("lists once for each project in the scheduled sessions sweep", async () => {
    mocks.findMany.mockResolvedValue([{ id: "project_1" }]);
    mocks.resolveConnection.mockResolvedValue({
      credentials: input.credentials,
      property: input.property,
    });
    mocks.readConfigured.mockResolvedValue(false);

    await cacheGa4KeyEventsConfigurationsForAllProjects(input.now);

    expect(mocks.readConfigured).toHaveBeenCalledTimes(1);
    expect(mocks.readConfigured).toHaveBeenCalledWith(input.credentials);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
