import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import {
  importFailureReason,
  loadImportRow,
  markImportFailed,
  recordImportFailure,
} from "@/lib/search-insights/sync/import-state";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markNeedsReauth: vi.fn(),
  prisma: {
    searchAnalyticsImport: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: mocks.markNeedsReauth }));

const failure = { connectionId: "conn_1", importId: "imp_1", projectId: "project_1" };

describe("importFailureReason", () => {
  it("separates quota, authorization and everything else", () => {
    expect(importFailureReason(new ProviderRateLimitedError("gsc"))).toBe("rate_limited");
    expect(importFailureReason(new ProviderAuthError("gsc"))).toBe("needs_reauth");
    expect(importFailureReason(new Error("connection lost"))).toBe("error");
  });
});

describe("loadImportRow", () => {
  it("reads the one row that owns this property for this source", () => {
    loadImportRow("project_1", "sc-domain:example.com");

    expect(mocks.prisma.searchAnalyticsImport.findUnique).toHaveBeenCalledWith({
      where: {
        projectId_property_source: {
          projectId: "project_1",
          property: "sc-domain:example.com",
          source: "gsc",
        },
      },
    });
  });
});

describe("recordImportFailure", () => {
  it("records when quota last paused without clearing it on resume", async () => {
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
    await recordImportFailure({
      connectionId: "con_1",
      error: new ProviderRateLimitedError("quota"),
      importId: "imp_1",
      projectId: "prj_1",
    });
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastQuotaPausedAt: expect.any(Date),
          pausedReason: "rate_limited",
        }),
      }),
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
  });

  it("pauses the import and flags the connection when authorization is gone", async () => {
    await expect(
      recordImportFailure({ ...failure, error: new ProviderAuthError("gsc") }),
    ).resolves.toBe("needs_reauth");

    expect(mocks.markNeedsReauth).toHaveBeenCalledWith({
      connectionId: "conn_1",
      notifyOps: false,
      projectId: "project_1",
      provider: "gsc",
    });
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastErrorClass: "auth",
          pausedReason: "needs_reauth",
          state: "paused",
        }),
        where: expect.objectContaining({ id: "imp_1" }),
      }),
    );
  });

  it("pauses on quota without touching the connection status", async () => {
    await expect(
      recordImportFailure({ ...failure, error: new ProviderRateLimitedError("gsc") }),
    ).resolves.toBe("rate_limited");

    expect(mocks.markNeedsReauth).not.toHaveBeenCalled();
    // A quota pause is a limitation the strip renders from pausedReason; a failure sentence
    // beside it would call a healthy import broken.
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastErrorClass: "rate_limit",
          lastQuotaPausedAt: expect.any(Date),
          pausedReason: "rate_limited",
          state: "paused",
        }),
        where: expect.objectContaining({ id: "imp_1" }),
      }),
    );
  });

  it("does not duplicate a state log when the durable row is unchanged", async () => {
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 0 });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await recordImportFailure({
      ...failure,
      error: new ProviderRateLimitedError("gsc"),
      stream: "backfill",
    });

    expect(consoleInfo).not.toHaveBeenCalled();
    consoleInfo.mockRestore();
  });

  it("keeps an unexpected failure out of the paused states and stores a generic message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      recordImportFailure({ ...failure, error: new Error("token abc123 rejected") }),
    ).resolves.toBe("error");

    const data = mocks.prisma.searchAnalyticsImport.updateMany.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty("state");
    expect(data.lastError).not.toContain("abc123");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("markImportFailed", () => {
  it("records the terminal state only when the workflow gives up", async () => {
    await markImportFailed("project_1", "sc-domain:example.com");

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenLastCalledWith({
      data: { state: "failed" },
      where: {
        pausedReason: { not: "user" },
        projectId: "project_1",
        property: "sc-domain:example.com",
        source: "gsc",
        state: { not: "failed" },
      },
    });
  });
});
