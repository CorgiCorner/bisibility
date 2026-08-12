import { ProviderAuthError } from "@/lib/providers/auth-error";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadStoredGoogleProperties, saveStoredGoogleProperty } from "./google-stored-property";

const mocks = vi.hoisted(() => ({
  decryptProviderCredentials: vi.fn(),
  encryptSecret: vi.fn(),
  listGa4Properties: vi.fn(),
  listGoogleSites: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    providerConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  refreshGoogleAccessToken: vi.fn(),
  verifyProviderConnectionBeforeSave: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/provider-verification", () => ({
  verifyProviderConnectionBeforeSave: mocks.verifyProviderConnectionBeforeSave,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: mocks.decryptProviderCredentials,
  encryptSecret: mocks.encryptSecret,
}));
vi.mock("@/lib/providers/registry", () => ({
  PROVIDER_CATALOG: [
    { id: "gsc", kind: "analytics" },
    { id: "ga4", kind: "analytics" },
  ],
}));
vi.mock("./google-client", () => ({
  listGa4Properties: mocks.listGa4Properties,
  listGoogleSites: mocks.listGoogleSites,
  refreshGoogleAccessToken: mocks.refreshGoogleAccessToken,
}));

const connection = {
  credentialsEncrypted: "encrypted_credentials",
  id: "connection_1",
  publicId: "conn_abcdefghijklmnopqrstuvwx",
};

describe("stored Google property selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptProviderCredentials.mockReturnValue({
      apiKey: "refresh_secret",
      login: "sc-domain:old.example.com",
    });
    mocks.encryptSecret.mockReturnValue("updated_encrypted_credentials");
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connection);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.refreshGoogleAccessToken.mockResolvedValue("access_secret");
    mocks.listGoogleSites.mockResolvedValue([
      { permissionLevel: "siteOwner", siteUrl: "sc-domain:example.com" },
      { permissionLevel: "siteUnverifiedUser", siteUrl: "sc-domain:hidden.example.com" },
    ]);
    mocks.listGa4Properties.mockResolvedValue([
      { accountDisplayName: "Account", displayName: "Website", propertyId: "123456789" },
    ]);
    mocks.verifyProviderConnectionBeforeSave.mockResolvedValue(undefined);
  });

  it("returns only property metadata and never exposes stored tokens", async () => {
    const result = await loadStoredGoogleProperties({ projectId: "project_1", provider: "gsc" });

    expect(result).toEqual({
      preferredProperty: "sc-domain:old.example.com",
      properties: [
        {
          kind: "domain",
          label: "example.com (Domain property)",
          permissionLevel: "siteOwner",
          value: "sc-domain:example.com",
        },
      ],
      provider: "gsc",
    });
    expect(JSON.stringify(result)).not.toContain("refresh_secret");
    expect(JSON.stringify(result)).not.toContain("access_secret");
  });

  it("falls back to full OAuth when the stored token is missing", async () => {
    mocks.decryptProviderCredentials.mockReturnValue({ login: "sc-domain:example.com" });

    await expect(
      loadStoredGoogleProperties({ projectId: "project_1", provider: "gsc" }),
    ).resolves.toEqual({
      error: "Reconnect the Google account to load its properties.",
      properties: [],
      provider: "gsc",
      requiresReauth: true,
    });
    expect(mocks.refreshGoogleAccessToken).not.toHaveBeenCalled();
  });

  it("falls back without leaking a revoked-token error", async () => {
    mocks.refreshGoogleAccessToken.mockRejectedValue(
      new ProviderAuthError("google", "invalid_grant: refresh_secret"),
    );

    const result = await loadStoredGoogleProperties({ projectId: "project_1", provider: "gsc" });

    expect(result).toMatchObject({ properties: [], requiresReauth: true });
    expect(JSON.stringify(result)).not.toContain("invalid_grant");
    expect(JSON.stringify(result)).not.toContain("refresh_secret");
  });

  it("revalidates the selected property and audits the encrypted update atomically", async () => {
    await expect(
      saveStoredGoogleProperty({
        actorId: "user_1",
        projectId: "project_1",
        property: "sc-domain:example.com",
        provider: "gsc",
      }),
    ).resolves.toEqual({ property: "sc-domain:example.com", status: "saved" });

    expect(mocks.verifyProviderConnectionBeforeSave).toHaveBeenCalledWith({
      credentials: { apiKey: "refresh_secret", login: "sc-domain:example.com" },
      hasStoredCredentials: true,
      projectId: "project_1",
      provider: expect.objectContaining({ id: "gsc" }),
    });
    expect(mocks.prisma.providerConnection.update).toHaveBeenCalledWith({
      data: {
        credentialsEncrypted: "updated_encrypted_credentials",
        status: "connected",
      },
      where: { id: "connection_1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.update",
        actorId: "user_1",
        after: expect.objectContaining({
          property: "sc-domain:example.com",
          provider: "gsc",
        }),
        before: expect.objectContaining({ property: "sc-domain:old.example.com" }),
        targetId: "conn_abcdefghijklmnopqrstuvwx",
      }),
      mocks.prisma,
    );
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("refresh_secret");
  });

  it("normalizes and revalidates a stored Analytics property against the live account", async () => {
    mocks.decryptProviderCredentials.mockReturnValue({
      apiKey: "refresh_secret",
      login: "987654321",
    });

    await expect(
      saveStoredGoogleProperty({
        actorId: "user_1",
        projectId: "project_1",
        property: "properties/123456789",
        provider: "ga4",
      }),
    ).resolves.toEqual({ property: "123456789", status: "saved" });

    expect(mocks.verifyProviderConnectionBeforeSave).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { apiKey: "refresh_secret", login: "123456789" },
        provider: expect.objectContaining({ id: "ga4" }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({
          permissionLevel: "Account",
          property: "123456789",
        }),
        before: expect.objectContaining({ property: "987654321" }),
      }),
      mocks.prisma,
    );
  });

  it("rejects a property not returned by the live account", async () => {
    await expect(
      saveStoredGoogleProperty({
        actorId: "user_1",
        projectId: "project_1",
        property: "sc-domain:not-in-account.example.com",
        provider: "gsc",
      }),
    ).rejects.toThrow("Select a property returned by the connected account");
    expect(mocks.verifyProviderConnectionBeforeSave).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires reauthorization instead of writing when the token is revoked at save time", async () => {
    mocks.refreshGoogleAccessToken.mockRejectedValue(new ProviderAuthError("google"));

    await expect(
      saveStoredGoogleProperty({
        actorId: "user_1",
        projectId: "project_1",
        property: "sc-domain:example.com",
        provider: "gsc",
      }),
    ).resolves.toEqual({ status: "reauth_required" });
    expect(mocks.prisma.providerConnection.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
