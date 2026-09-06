import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportSearchInsightsCsv,
  loadSearchInsightsProperties,
  selectSearchInsightsProperty,
  syncSearchInsightsNow,
} from "./search-insights";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  csv: vi.fn(),
  findArchived: vi.fn(),
  findPartition: vi.fn(),
  loadProperties: vi.fn(),
  project: { id: "project_1", publicId: "prj_1" },
  requestSync: vi.fn(),
  requireScope: vi.fn(),
  revalidatePath: vi.fn(),
  saveProperty: vi.fn(),
  transaction: vi.fn(),
  updateRegistry: vi.fn(),
  upsertRegistry: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    searchAnalyticsSyncPartition: { findFirst: mocks.findPartition },
    searchInsightsPropertyRegistry: { findMany: mocks.findArchived },
  },
}));
vi.mock("@/lib/providers/analytics/google-stored-property", () => ({
  loadStoredGoogleProperties: mocks.loadProperties,
  saveStoredGoogleProperty: mocks.saveProperty,
}));
vi.mock("@/lib/search-insights/queries/query-export", () => ({
  getSearchInsightsQueryCsv: mocks.csv,
}));
vi.mock("@/lib/search-insights/sync/sync-now", () => ({
  requestSearchInsightsSync: mocks.requestSync,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  unstable_cache: (read: () => unknown) => read,
}));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

describe("search insights actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue(mocks.project);
    mocks.saveProperty.mockResolvedValue({ property: "sc-domain:example.com", status: "saved" });
    mocks.requestSync.mockResolvedValue({ status: "unavailable" });
    mocks.findArchived.mockResolvedValue([]);
    mocks.transaction.mockImplementation((callback) =>
      callback({
        searchInsightsPropertyRegistry: {
          updateMany: mocks.updateRegistry,
          upsert: mocks.upsertRegistry,
        },
      }),
    );
  });

  it("rebuilds each option from its kind instead of the composed provider label", async () => {
    mocks.loadProperties.mockResolvedValue({
      preferredProperty: "sc-domain:example.com",
      properties: [
        {
          kind: "domain",
          label: "example.com (domain)",
          permissionLevel: "siteOwner",
          value: "sc-domain:example.com",
        },
        {
          kind: "url-prefix",
          label: "https://blog.example.com/ (URL prefix)",
          permissionLevel: "siteFullUser",
          value: "https://blog.example.com/",
        },
      ],
    });

    await expect(loadSearchInsightsProperties({ projectId: "prj_1" })).resolves.toEqual({
      archived: [],
      properties: [
        {
          displayName: "example.com",
          kind: "domain",
          kindLabel: "domain",
          permissionLevel: "siteOwner",
          value: "sc-domain:example.com",
        },
        {
          displayName: "https://blog.example.com/",
          kind: "url-prefix",
          kindLabel: "url prefix",
          permissionLevel: "siteFullUser",
          value: "https://blog.example.com/",
        },
      ],
      selected: "sc-domain:example.com",
    });
    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "manage", "prj_1", {
      type: "provider_connection",
    });
  });

  it("passes a lost consent on to the picker instead of an empty list", async () => {
    mocks.loadProperties.mockResolvedValue({
      archived: [],
      error: "Reconnect Google.",
      properties: [],
      requiresReauth: true,
    });

    await expect(loadSearchInsightsProperties({ projectId: "prj_1" })).resolves.toEqual({
      archived: [],
      error: "Reconnect Google.",
      properties: [],
      requiresReauth: true,
    });
  });

  it("stores the selected property and refreshes the module route", async () => {
    await expect(
      selectSearchInsightsProperty({ projectId: "prj_1", property: "sc-domain:example.com" }),
    ).resolves.toEqual({ property: "sc-domain:example.com", status: "saved" });

    expect(mocks.saveProperty).toHaveBeenCalledWith({
      actorId: "user_1",
      projectId: "project_1",
      property: "sc-domain:example.com",
      provider: "gsc",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/[project]/search-console", "page");
  });

  it("refreshes the module route when the property needs consent", async () => {
    mocks.saveProperty.mockResolvedValue({ status: "reauth_required" });

    await selectSearchInsightsProperty({ projectId: "prj_1", property: "sc-domain:example.com" });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/[project]/search-console", "page");
  });

  it("asks for the update scope before it requests a sync", async () => {
    await expect(syncSearchInsightsNow({ projectId: "prj_1" })).resolves.toEqual({
      status: "unavailable",
    });

    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "update", "prj_1", {
      type: "project",
    });
    expect(mocks.requestSync).toHaveBeenCalledWith({ actorId: "user_1", projectId: "project_1" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refreshes the module after the worker intent is queued", async () => {
    mocks.requestSync.mockResolvedValue({ status: "queued" });

    await expect(syncSearchInsightsNow({ projectId: "prj_1" })).resolves.toEqual({
      status: "queued",
    });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/[project]/search-console", "page");
  });

  it("builds the export from the project reference and the requested window", async () => {
    const csv = { csv: "query,clicks", filename: "queries.csv", rows: 1, truncated: false };
    mocks.csv.mockResolvedValue(csv);

    await expect(exportSearchInsightsCsv({ period: "90", projectId: "prj_1" })).resolves.toBe(csv);
    expect(mocks.csv).toHaveBeenCalledWith("prj_1", "90");
  });
});
