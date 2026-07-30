import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completePendingGooglePropertySelection,
  getPendingGoogleOAuthSetup,
} from "./google-oauth-pending";

const mocks = vi.hoisted(() => ({
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
    providerConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
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
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: mocks.decryptProviderCredentials,
  decryptSecret: mocks.decryptSecret,
  encryptSecret: mocks.encryptSecret,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieStore.get.mockReturnValue({ value: "encrypted_pending" });
    mocks.decryptSecret.mockReturnValue(JSON.stringify(pending));
    mocks.decryptProviderCredentials.mockReturnValue({});
    mocks.encryptSecret.mockReturnValue("encrypted_credentials");
    mocks.getActionActor.mockResolvedValue({ id: "user_1", memberships: [], role: "owner" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.refreshGoogleAccessToken.mockResolvedValue("access_token");
    mocks.verifyProviderConnectionBeforeSave.mockResolvedValue(undefined);
    mocks.listGoogleSites.mockResolvedValue([
      { permissionLevel: "siteOwner", siteUrl: "sc-domain:example.com" },
      { permissionLevel: "siteFullUser", siteUrl: "https://example.com/" },
      { permissionLevel: "siteUnverifiedUser", siteUrl: "sc-domain:unverified.example.com" },
    ]);
    mocks.listGa4Properties.mockResolvedValue([
      {
        accountDisplayName: "CorgiCorner",
        displayName: "Bisibility",
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
          label: "Bisibility (123456789)",
          permissionLevel: "CorgiCorner",
          value: "123456789",
        },
      ],
      provider: "ga4",
    });
  });

  it("degrades a failed GA4 summaries request to guided manual entry", async () => {
    mocks.decryptSecret.mockReturnValue(JSON.stringify({ ...pending, provider: "ga4" }));
    mocks.listGa4Properties.mockRejectedValue(new Error("admin api unavailable"));

    await expect(getPendingGoogleOAuthSetup("prj_1")).resolves.toEqual({
      error: expect.stringContaining("enter the numeric Property ID manually"),
      properties: [],
      provider: "ga4",
    });
  });

  it("exposes only verified properties with their exact Google ids", async () => {
    await expect(getPendingGoogleOAuthSetup("prj_1")).resolves.toEqual({
      properties: [
        {
          kind: "domain",
          label: "example.com (Domain property)",
          permissionLevel: "siteOwner",
          value: "sc-domain:example.com",
        },
        {
          kind: "url-prefix",
          label: "https://example.com/ (URL-prefix property)",
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
    expect(mocks.prisma.providerConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          credentialsEncrypted: "encrypted_credentials",
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
    );
    expect(mocks.revalidateProviderViews).toHaveBeenCalledOnce();
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
        create: expect.objectContaining({ provider: "ga4", status: "connected" }),
      }),
    );
  });
});
