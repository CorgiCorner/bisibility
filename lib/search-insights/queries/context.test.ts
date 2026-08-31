import { dateFromFrozenNow, isoFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    providerConnection: { findUnique: vi.fn() },
    searchAnalyticsImport: { findFirst: vi.fn(), findUnique: vi.fn() },
    searchInsightsPropertyRegistry: { findFirst: vi.fn() },
    searchAnalyticsRequestUsage: { findFirst: vi.fn(), findMany: vi.fn() },
    searchAnalyticsSyncPartition: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  readImportObservability: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./import-observability-db", () => ({
  readImportObservability: mocks.readImportObservability,
}));

const { getSearchInsightsContext, loadSearchInsightsScope } = await import("./context");

const importRow = {
  availabilityBoundarySource: "metadata",
  capHitDays: 2,
  cursorDate: new Date("2025-10-08T00:00:00.000Z"),
  daysDone: 270,
  daysTotal: 480,
  earliestTargetDate: new Date("2025-03-08T00:00:00.000Z"),
  finalizedThroughDate: new Date("2026-07-08T00:00:00.000Z"),
  lastProbeAt: dateFromFrozenNow({ hours: -15, minutes: -40 }),
  lastSyncStartedAt: dateFromFrozenNow({ hours: -17 }),
  newestFinalizedDate: new Date("2026-07-08T00:00:00.000Z"),
  pausedReason: null,
  state: "running",
};

describe("getSearchInsightsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "internal_1" } });
    mocks.readImportObservability.mockResolvedValue({
      completedDays: 270,
      etaLabel: null,
      firstViewReady: true,
      localReadableThrough: "2026-07-08",
      lastActivityAt: null,
      waiting: false,
    });
    mocks.decrypt.mockReturnValue({ apiKey: "token", login: "sc-domain:example.com" });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "v2:key:iv:tag:value",
      status: "connected",
    });
    mocks.prisma.searchAnalyticsImport.findFirst.mockResolvedValue(null);
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue(importRow);
    mocks.prisma.searchInsightsPropertyRegistry.findFirst.mockResolvedValue(null);
    mocks.prisma.searchAnalyticsSyncPartition.findFirst.mockResolvedValue(null);
    mocks.prisma.searchAnalyticsSyncPartition.findMany.mockResolvedValue([]);
    mocks.prisma.searchAnalyticsRequestUsage.findFirst.mockResolvedValue(null);
    mocks.prisma.searchAnalyticsRequestUsage.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([{ pages: 212n, queries: 1284n }]);
  });

  it("reports the connected property, the finalized window and the stored row counts", async () => {
    const context = await getSearchInsightsContext("prj_1");

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.providerConnection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_provider: { projectId: "internal_1", provider: "gsc" } },
      }),
    );
    expect(context.connection).toEqual({
      property: {
        displayName: "example.com",
        kind: "domain",
        kindLabel: "domain",
        value: "sc-domain:example.com",
      },
      status: "connected",
    });
    expect(context.period.id).toBe("28");
    expect(context.window).toEqual({
      current: { end: "2026-07-08", start: "2026-06-11" },
      previous: { end: "2026-06-10", start: "2026-05-14" },
    });
    expect(context.counts).toEqual({ pages: 212, queries: 1284 });
    expect(context.importState).toEqual({
      availabilityBoundarySource: "metadata",
      capHitDays: 2,
      completedDays: 270,
      cursorDate: "2025-10-08",
      daysDone: 270,
      daysTotal: 480,
      earliestTargetDate: "2025-03-08",
      etaLabel: null,
      finalizedThroughDate: "2026-07-08",
      firstViewReady: true,
      localReadableThrough: "2026-07-08",
      lastActivityAt: null,
      lastProbeAt: isoFromFrozenNow({ hours: -15, minutes: -40 }),
      lastSyncStartedAt: isoFromFrozenNow({ hours: -17 }),
      newestFinalizedDate: "2026-07-08",
      pauseStartedAt: null,
      pausedById: null,
      pausedReason: null,
      plannedRetentionMonths: null,
      safeError: null,
      state: "running",
      waiting: false,
    });
    expect(context.yoy).toEqual({ monthsImported: 9, required: 13 });
  });

  it("moves the window with the requested period and ignores an invalid one", async () => {
    const seven = await getSearchInsightsContext("prj_1", { period: "7" });
    expect(seven.window?.current).toEqual({ end: "2026-07-08", start: "2026-07-02" });

    const invalid = await getSearchInsightsContext("prj_1", { period: "31" });
    expect(invalid.period.days).toBe(28);
  });

  it("reads no rows and no import when nothing is connected", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);

    const context = await getSearchInsightsContext("prj_1");

    expect(context.connection).toEqual({ property: null, status: "not_connected" });
    expect(context.importState).toBeNull();
    expect(context.window).toBeNull();
    expect(context.counts).toEqual({ pages: 0, queries: 0 });
    expect(mocks.prisma.searchAnalyticsImport.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("keeps the stored property visible while the connection needs a new consent", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "v2:key:iv:tag:value",
      status: "needs_reauth",
    });

    const context = await getSearchInsightsContext("prj_1");

    expect(context.connection.status).toBe("needs_reauth");
    expect(context.connection.property?.value).toBe("sc-domain:example.com");
  });

  it("treats undecryptable credentials as no property rather than failing the page", async () => {
    mocks.decrypt.mockImplementation(() => {
      throw new Error("bad key");
    });

    const context = await getSearchInsightsContext("prj_1");

    expect(context.connection).toEqual({ property: null, status: "not_connected" });
    expect(context.window).toBeNull();
  });

  it("has no window before the first finalized day is stored", async () => {
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue({
      ...importRow,
      finalizedThroughDate: null,
      state: "queued",
    });
    mocks.readImportObservability.mockResolvedValue({
      completedDays: 0,
      etaLabel: null,
      firstViewReady: false,
      localReadableThrough: null,
      lastActivityAt: null,
      waiting: false,
    });

    const context = await getSearchInsightsContext("prj_1");

    expect(context.window).toBeNull();
    expect(context.counts).toEqual({ pages: 0, queries: 0 });
    expect(context.importState?.state).toBe("queued");
  });
  it("selects an archived property only when the project registry marks it archived", async () => {
    mocks.prisma.searchInsightsPropertyRegistry.findFirst.mockResolvedValue({
      ga4PropertyId: null,
      propertyKey: "sc-domain:archived.example.com",
    });

    const scope = await loadSearchInsightsScope("prj_1", {
      property: "SC-DOMAIN:Archived.example.com/",
    });

    expect(mocks.prisma.searchInsightsPropertyRegistry.findFirst).toHaveBeenCalledWith({
      select: { ga4PropertyId: true, propertyKey: true },
      where: {
        projectId: "internal_1",
        propertyKey: "sc-domain:archived.example.com",
        status: "archived",
      },
    });
    expect(scope.connection.property?.value).toBe("sc-domain:example.com");
    expect(scope.property).toBe("sc-domain:archived.example.com");
    expect(scope.view).toBe("archived");
  });

  it("rejects an unbacked archived request without changing the active selection", async () => {
    const scope = await loadSearchInsightsScope("prj_1", {
      property: "sc-domain:unknown.example.com",
    });

    expect(scope.property).toBe("sc-domain:example.com");
    expect(scope.view).toBe("active");
  });

  it("does not expose GA4 sessions while viewing archived Search Console data", async () => {
    mocks.prisma.searchAnalyticsImport.findFirst.mockResolvedValue({ id: "import_archived" });

    const scope = await loadSearchInsightsScope("prj_1", {
      property: "sc-domain:archived.example.com",
    });

    expect(scope.organicSessions).toEqual({
      importState: null,
      property: null,
      status: "not_connected",
    });
  });

  it("returns no sessions for an archived view with no recorded Analytics pairing", async () => {
    mocks.prisma.searchAnalyticsImport.findFirst.mockResolvedValue({ id: "import_archived" });
    mocks.prisma.searchInsightsPropertyRegistry.findFirst.mockResolvedValue(null);

    const scope = await loadSearchInsightsScope("prj_1", {
      property: "sc-domain:archived.example.com",
    });

    expect(mocks.prisma.searchInsightsPropertyRegistry.findFirst).toHaveBeenCalledWith({
      select: { ga4PropertyId: true, propertyKey: true },
      where: {
        projectId: "internal_1",
        propertyKey: "sc-domain:archived.example.com",
        status: "archived",
      },
    });
    expect(scope.organicSessions).toEqual({
      importState: null,
      property: null,
      status: "not_connected",
    });
  });

  it("exposes archived sessions only through the recorded Analytics pairing when it covers the archived window", async () => {
    mocks.prisma.searchAnalyticsImport.findFirst.mockResolvedValue({ id: "import_archived" });
    mocks.prisma.searchAnalyticsImport.findUnique.mockImplementation(({ where }) =>
      where.projectId_property_source.property === "sc-domain:archived.example.com"
        ? {
            ...importRow,
            finalizedThroughDate: new Date("2026-07-08T00:00:00.000Z"),
            state: "completed",
          }
        : importRow,
    );
    mocks.prisma.searchInsightsPropertyRegistry.findFirst.mockResolvedValue({
      ga4PropertyId: "123456789",
      propertyKey: "sc-domain:archived.example.com",
    });

    const scope = await loadSearchInsightsScope("prj_1", {
      property: "sc-domain:archived.example.com",
    });

    expect(mocks.prisma.searchInsightsPropertyRegistry.findFirst).toHaveBeenCalledWith({
      select: { ga4PropertyId: true, propertyKey: true },
      where: {
        projectId: "internal_1",
        propertyKey: "sc-domain:archived.example.com",
        status: "archived",
      },
    });
    expect(scope.organicSessions).toMatchObject({
      property: "123456789",
      status: "connected",
    });
  });
});
