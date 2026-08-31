import type { FinalizedWindow } from "@/lib/search-insights/dates";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    providerConnection: { findUnique: vi.fn() },
    searchAnalyticsImport: { findUnique: vi.fn() },
  },
  runtimeCredentials: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/traffic/runtime-credentials", () => ({
  trafficRuntimeCredentials: mocks.runtimeCredentials,
}));

const { organicSessionsImportCoversWindow, readOrganicSessionsContext } = await import(
  "./sessions-context"
);
const { readOrganicSessionsConnection } = await import(
  "@/lib/search-insights/sync/sessions-credentials"
);

const window: FinalizedWindow = {
  current: { end: "2026-07-08", start: "2026-06-11" },
  previous: { end: "2026-06-10", start: "2026-05-14" },
};

function importState(overrides: Record<string, unknown> = {}) {
  return {
    capHitDays: 0,
    cursorDate: "2026-05-13",
    daysDone: 30,
    daysTotal: 488,
    earliestTargetDate: "2025-03-14",
    finalizedThroughDate: "2026-07-08",
    lastProbeAt: null,
    lastSyncStartedAt: null,
    newestFinalizedDate: "2026-07-08",
    pausedReason: null,
    state: "running",
    ...overrides,
  };
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    credentialsEncrypted: "encrypted",
    enabled: true,
    id: "conn_1",
    provider: "ga4",
    status: "connected",
    ...overrides,
  };
}

describe("organicSessionsImportCoversWindow", () => {
  it("accepts an in-progress import that covers both compared windows", () => {
    expect(organicSessionsImportCoversWindow(importState(), window)).toBe(true);
  });

  it("rejects an import whose newest finalized date is too old", () => {
    expect(
      organicSessionsImportCoversWindow(
        importState({ finalizedThroughDate: "2026-07-07" }),
        window,
      ),
    ).toBe(false);
  });

  it("rejects an import whose cursor has not reached the first compared day", () => {
    expect(
      organicSessionsImportCoversWindow(importState({ cursorDate: "2026-05-14" }), window),
    ).toBe(false);
  });

  it("uses a completed import's retention boundary as its oldest stored day", () => {
    expect(
      organicSessionsImportCoversWindow(
        importState({ cursorDate: null, earliestTargetDate: "2026-05-14", state: "completed" }),
        window,
      ),
    ).toBe(true);
  });

  it("rejects a connection with no import row", () => {
    expect(organicSessionsImportCoversWindow(null, window)).toBe(false);
  });
});

describe("readOrganicSessionsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtimeCredentials.mockReturnValue({
      apiKey: "refresh_token",
      login: "properties/123456789",
    });
  });

  it("reads the normalized numeric property and its source-specific import state", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connection());
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue({
      capHitDays: 0,
      cursorDate: new Date("2026-05-13T00:00:00.000Z"),
      daysDone: 30,
      daysTotal: 488,
      earliestTargetDate: new Date("2025-03-14T00:00:00.000Z"),
      finalizedThroughDate: new Date("2026-07-08T00:00:00.000Z"),
      lastProbeAt: null,
      lastSyncStartedAt: null,
      newestFinalizedDate: new Date("2026-07-08T00:00:00.000Z"),
      pausedReason: null,
      state: "running",
    });

    await expect(readOrganicSessionsContext("project_1")).resolves.toMatchObject({
      importState: { daysDone: 30, state: "running" },
      property: "123456789",
      status: "connected",
    });
    expect(mocks.prisma.searchAnalyticsImport.findUnique).toHaveBeenCalledWith({
      where: {
        projectId_property_source: { projectId: "project_1", property: "123456789", source: "ga4" },
      },
    });
  });

  it("uses the same env-fallback property for the worker and read paths", async () => {
    mocks.runtimeCredentials.mockReturnValue({ apiKey: "env_refresh_token", login: "987654321" });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(
      connection({ credentialsEncrypted: "empty-stored" }),
    );
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(null);

    const [context, resolved] = await Promise.all([
      readOrganicSessionsContext("project_1"),
      readOrganicSessionsConnection("project_1"),
    ]);

    expect(context.property).toBe("987654321");
    expect(resolved.connection?.property).toBe("987654321");
  });

  it("keeps a reconnecting connection visible without trying to join an unreadable property", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(
      connection({ status: "needs_reauth" }),
    );
    mocks.runtimeCredentials.mockReturnValue({ apiKey: "refresh_token", login: "" });

    await expect(readOrganicSessionsContext("project_1")).resolves.toEqual({
      importState: null,
      property: null,
      status: "needs_reauth",
    });
    expect(mocks.prisma.searchAnalyticsImport.findUnique).not.toHaveBeenCalled();
  });

  it("treats a disabled connection as unavailable to match the sync path", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connection({ enabled: false }));

    await expect(readOrganicSessionsContext("project_1")).resolves.toEqual({
      importState: null,
      property: null,
      status: "not_connected",
    });
    expect(mocks.prisma.searchAnalyticsImport.findUnique).not.toHaveBeenCalled();
  });
});
