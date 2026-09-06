import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderHttpError } from "@/lib/providers/failure-class";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completePendingGooglePropertySelection,
  formatGooglePropertyDiscoveryLog,
  getPendingGoogleOAuthProvider,
  getPendingGoogleOAuthSetup,
} from "./google-oauth-pending";

const mocks = vi.hoisted(() => ({
  backfillLegacyProjectAllocationInLockedTransaction: vi.fn(),
  cookieStore: {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
  decryptProviderCredentials: vi.fn(),
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
  getActionActor: vi.fn(),
  listGoogleSites: vi.fn(),
  listGa4Properties: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    providerConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  queueSearchInsightsImport: vi.fn(),
  refreshGoogleAccessToken: vi.fn(),
  requireProjectScope: vi.fn(),
  revalidateProviderViews: vi.fn(),
  verifyProviderConnectionBeforeSave: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
  revalidateProviderViews: mocks.revalidateProviderViews,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/provider-allocations/legacy-backfill", () => ({
  backfillLegacyProjectAllocationInLockedTransaction:
    mocks.backfillLegacyProjectAllocationInLockedTransaction,
}));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: mocks.decryptProviderCredentials,
  decryptSecret: mocks.decryptSecret,
  encryptSecret: mocks.encryptSecret,
}));
vi.mock("@/lib/search-insights/sync/ensure-import", () => ({
  queueSearchInsightsImport: mocks.queueSearchInsightsImport,
}));
vi.mock("@/lib/api/provider-verification", () => ({
  verifyProviderConnectionBeforeSave: mocks.verifyProviderConnectionBeforeSave,
}));
vi.mock("./google-client", () => ({
  listGa4Properties: mocks.listGa4Properties,
  listGoogleSites: mocks.listGoogleSites,
  refreshGoogleAccessToken: mocks.refreshGoogleAccessToken,
}));

const pending = {
  actorId: "user_1",
  issuedAt: Date.now(),
  projectId: "project_1",
  provider: "gsc",
  refreshToken: "refresh_token",
};

describe("pending Google OAuth property selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backfillLegacyProjectAllocationInLockedTransaction.mockResolvedValue({
      internalPrimaryConnectionId: null,
      status: "already_backfilled",
    });
    mocks.cookieStore.get.mockReturnValue({ value: "encrypted_pending" });
    mocks.decryptSecret.mockReturnValue(JSON.stringify(pending));
    mocks.decryptProviderCredentials.mockReturnValue({});
    mocks.encryptSecret.mockReturnValue("encrypted_credentials");
    mocks.getActionActor.mockResolvedValue({ id: "user_1", memberships: [], role: "owner" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.refreshGoogleAccessToken.mockResolvedValue("access_token");
    mocks.verifyProviderConnectionBeforeSave.mockResolvedValue(undefined);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.listGoogleSites.mockResolvedValue([
      { permissionLevel: "siteOwner", siteUrl: "sc-domain:example.com" },
      { permissionLevel: "siteFullUser", siteUrl: "https://example.com/" },
      { permissionLevel: "siteUnverifiedUser", siteUrl: "sc-domain:unverified.example.com" },
    ]);
    mocks.listGa4Properties.mockResolvedValue([
      {
        accountDisplayName: "CorgiCorner",
        displayName: "bisibility",
        propertyId: "123456789",
      },
    ]);
  });

  it("exposes GA4 account summaries as display-name and numeric-id options", async () => {
    mocks.decryptSecret.mockReturnValue(JSON.stringify({ ...pending, provider: "ga4" }));

    await expect(getPendingGoogleOAuthSetup("prj_1")).resolves.toEqual({
      properties: [
        {
          kind: "ga4",
          label: "bisibility (123456789)",
          permissionLevel: "CorgiCorner",
          value: "123456789",
        },
      ],
      provider: "ga4",
    });
  });

  it("returns the provider from the scoped pending OAuth state", async () => {
    mocks.decryptSecret.mockReturnValue(JSON.stringify({ ...pending, provider: "ga4" }));

    await expect(getPendingGoogleOAuthProvider("prj_1")).resolves.toBe("ga4");

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user_1" }),
      "manage",
      "prj_1",
      { type: "provider_connection" },
    );
  });

  it.each([
    [
      new ProviderAuthError("google", "raw auth payload"),
      "auth",
      "This Google account may not have Analytics access, or Google rejected the request.",
    ],
    [
      new ProviderHttpError(403, "raw forbidden payload"),
      "provider_4xx",
      "This Google account may not have Analytics access, or Google rejected the request.",
    ],
    [
      new ProviderRateLimitedError("ga4", { message: "raw quota payload" }),
      "rate_limit",
      "Google's request limit was reached. Try again shortly.",
    ],
    [
      new ProviderHttpError(503, "raw outage payload"),
      "provider_5xx",
      "Google Analytics is temporarily unavailable.",
    ],
    [
      new TypeError("raw network payload"),
      "network",
      "Google Analytics is temporarily unavailable.",
    ],
    [
      new Error("raw unknown payload"),
      "unknown",
      "This Google account may not have Analytics access, or the Analytics API rejected the request.",
    ],
  ])(
    "classifies and sanitizes failed GA4 property discovery",
    async (error, failureClass, reason) => {
      const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
      mocks.decryptSecret.mockReturnValue(JSON.stringify({ ...pending, provider: "ga4" }));
      mocks.listGa4Properties.mockRejectedValue(error);

      await expect(getPendingGoogleOAuthSetup("prj_1")).resolves.toEqual({
        error: `Couldn't load your GA4 properties. ${reason}`,
        failureClass,
        properties: [],
        provider: "ga4",
      });
      expect(info).toHaveBeenCalledWith(
        `[google] property discovery failed | provider ga4 | class ${failureClass}${
          error instanceof ProviderHttpError ? ` | status ${error.status}` : ""
        }`,
      );
      expect(errorLog).not.toHaveBeenCalled();
      expect(JSON.stringify(info.mock.calls)).not.toContain(error.message);
    },
  );

  it("formats property discovery diagnostics without sensitive data", () => {
    const output = formatGooglePropertyDiscoveryLog({
      failureClass: "provider_4xx",
      httpStatus: 403,
      provider: "ga4",
    });

    expect(output).toBe(
      "[google] property discovery failed | provider ga4 | class provider_4xx | status 403",
    );
    expect(output).not.toMatch(/refresh|token|payload|owner@example\.com|prj_|properties\/|stack/i);
    expect(formatGooglePropertyDiscoveryLog({ failureClass: "network", provider: "ga4" })).toBe(
      "[google] property discovery failed | provider ga4 | class network",
    );
  });

  it("uses only the pending GA4 refresh token for property discovery", async () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({ ...pending, provider: "ga4", refreshToken: "pending_ga4_refresh" }),
    );
    mocks.refreshGoogleAccessToken.mockResolvedValue("pending_ga4_access");

    await getPendingGoogleOAuthSetup("prj_1");

    expect(mocks.refreshGoogleAccessToken).toHaveBeenCalledWith("pending_ga4_refresh");
    expect(mocks.listGa4Properties).toHaveBeenCalledWith("pending_ga4_access");
    expect(mocks.decryptProviderCredentials).not.toHaveBeenCalled();
    expect(mocks.prisma.providerConnection.findUnique).not.toHaveBeenCalled();
  });

  it("does not list GA4 properties without a pending GA4 context", async () => {
    mocks.cookieStore.get.mockReturnValue(undefined);

    await expect(getPendingGoogleOAuthSetup("prj_1")).resolves.toBeNull();
    expect(mocks.refreshGoogleAccessToken).not.toHaveBeenCalled();
    expect(mocks.listGa4Properties).not.toHaveBeenCalled();
  });

  it("exposes only verified properties with their exact Google ids", async () => {
    await expect(getPendingGoogleOAuthSetup("prj_1")).resolves.toEqual({
      archivedProperties: [],
      projectDomain: "",
      properties: [
        {
          kind: "domain",
          label: "example.com",
          permissionLevel: "siteOwner",
          value: "sc-domain:example.com",
        },
        {
          kind: "url-prefix",
          label: "https://example.com/",
          permissionLevel: "siteFullUser",
          value: "https://example.com/",
        },
      ],
      provider: "gsc",
    });
  });

  it("persists only a property returned by the connected account", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.upsert.mockResolvedValue({
      id: "connection_1",
      publicId: "conn_abcdefghijklmnopqrstuvwx",
    });

    await expect(
      completePendingGooglePropertySelection({
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    ).resolves.toEqual({ property: "sc-domain:example.com" });

    expect(mocks.encryptSecret).toHaveBeenCalledWith(
      JSON.stringify({ apiKey: "refresh_token", login: "sc-domain:example.com" }),
    );
    expect(mocks.verifyProviderConnectionBeforeSave).toHaveBeenCalledWith({
      credentials: { apiKey: "refresh_token", login: "sc-domain:example.com" },
      hasStoredCredentials: false,
      projectId: "project_1",
      provider: expect.objectContaining({ id: "gsc", kind: "analytics" }),
    });
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.providerConnection.upsert.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.prisma.providerConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          credentialsEncrypted: "encrypted_credentials",
          firstSyncFinishedAt: null,
          firstSyncRequestedAt: expect.any(Date),
          firstSyncStartedAt: null,
          projectId: "project_1",
          provider: "gsc",
          publicId: expect.stringMatching(/^conn_[a-z0-9]{24}$/),
          status: "connected",
        }),
      }),
    );
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("google_oauth_pending");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "conn_abcdefghijklmnopqrstuvwx",
        targetType: "provider_connection",
      }),
      mocks.prisma,
    );
    expect(mocks.revalidateProviderViews).toHaveBeenCalledOnce();
  });

  it("persists the durable Google account email inside encrypted credentials", async () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({ ...pending, accountEmail: "owner@example.com" }),
    );
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.upsert.mockResolvedValue({
      id: "connection_1",
      publicId: "conn_abcdefghijklmnopqrstuvwx",
    });

    await completePendingGooglePropertySelection({
      projectId: "prj_1",
      property: "sc-domain:example.com",
    });

    expect(mocks.encryptSecret).toHaveBeenCalledWith(
      JSON.stringify({
        accountEmail: "owner@example.com",
        apiKey: "refresh_token",
        login: "sc-domain:example.com",
      }),
    );
  });

  it("queues the history import once the Search Console connection is written", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.upsert.mockResolvedValue({
      id: "connection_1",
      publicId: "conn_abcdefghijklmnopqrstuvwx",
    });

    await completePendingGooglePropertySelection({
      projectId: "prj_1",
      property: "sc-domain:example.com",
    });

    expect(mocks.queueSearchInsightsImport).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "sc-domain:example.com",
      source: "gsc",
    });
    expect(mocks.queueSearchInsightsImport.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.prisma.providerConnection.upsert.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("rejects a property that was not returned by Google", async () => {
    await expect(
      completePendingGooglePropertySelection({
        projectId: "prj_1",
        property: "sc-domain:not-in-account.example.com",
      }),
    ).rejects.toThrow("Select a verified Search Console property");
    expect(mocks.prisma.providerConnection.upsert).not.toHaveBeenCalled();
  });

  it("restores a connection that needs reauthorization to connected", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "old_credentials",
      id: "connection_1",
      publicId: "conn_abcdefghijklmnopqrstuvwx",
      status: "needs_reauth",
    });
    mocks.prisma.providerConnection.upsert.mockResolvedValue({
      id: "connection_1",
      publicId: "conn_abcdefghijklmnopqrstuvwx",
    });

    await completePendingGooglePropertySelection({
      projectId: "prj_1",
      property: "sc-domain:example.com",
    });

    expect(mocks.prisma.providerConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: "connected" }) }),
    );
  });

  it("does not re-request a first sync when an already connected property is reauthorized", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "old_credentials",
      enabled: true,
      id: "connection_1",
      kind: "analytics",
      publicId: "conn_abcdefghijklmnopqrstuvwx",
      status: "connected",
    });
    mocks.prisma.providerConnection.upsert.mockResolvedValue({
      id: "connection_1",
      publicId: "conn_abcdefghijklmnopqrstuvwx",
    });

    await completePendingGooglePropertySelection({
      projectId: "prj_1",
      property: "sc-domain:example.com",
    });

    const { update } = mocks.prisma.providerConnection.upsert.mock.calls[0][0];
    expect(update).not.toHaveProperty("firstSyncRequestedAt");
    expect(update).not.toHaveProperty("firstSyncStartedAt");
    expect(update).not.toHaveProperty("firstSyncFinishedAt");
  });

  it("keeps GA4 pending and does not write connected when the property probe fails", async () => {
    mocks.decryptSecret.mockReturnValue(JSON.stringify({ ...pending, provider: "ga4" }));
    mocks.verifyProviderConnectionBeforeSave.mockRejectedValue(
      new Error("Connection test failed: Property 123456789 was not found. Re-select it."),
    );

    await expect(
      completePendingGooglePropertySelection({
        projectId: "prj_1",
        property: "123456789",
      }),
    ).rejects.toThrow("Property 123456789 was not found. Re-select it.");

    expect(mocks.prisma.providerConnection.upsert).not.toHaveBeenCalled();
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled();
  });

  it("writes a verified GA4 connection exactly once after the property probe passes", async () => {
    mocks.decryptSecret.mockReturnValue(JSON.stringify({ ...pending, provider: "ga4" }));
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.upsert.mockResolvedValue({
      id: "connection_1",
      publicId: "conn_abcdefghijklmnopqrstuvwx",
    });

    await expect(
      completePendingGooglePropertySelection({
        projectId: "prj_1",
        property: "properties/123456789",
      }),
    ).resolves.toEqual({ property: "123456789" });

    expect(mocks.verifyProviderConnectionBeforeSave).toHaveBeenCalledOnce();
    expect(mocks.verifyProviderConnectionBeforeSave).toHaveBeenCalledWith({
      credentials: { apiKey: "refresh_token", login: "123456789" },
      hasStoredCredentials: false,
      projectId: "project_1",
      provider: expect.objectContaining({ id: "ga4", kind: "analytics" }),
    });
    expect(mocks.prisma.providerConnection.upsert).toHaveBeenCalledOnce();
    expect(mocks.prisma.providerConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          firstSyncFinishedAt: null,
          firstSyncRequestedAt: expect.any(Date),
          firstSyncStartedAt: null,
          provider: "ga4",
          status: "connected",
        }),
      }),
    );
    expect(mocks.queueSearchInsightsImport).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "123456789",
      source: "ga4",
    });
  });
});
