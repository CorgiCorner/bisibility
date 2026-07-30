import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeGoogleOAuthInstall, createGoogleInstallState } from "./google-oauth";

const mocks = vi.hoisted(() => ({
  cookieStore: { delete: vi.fn(), get: vi.fn(), set: vi.fn() },
  decryptProviderCredentials: vi.fn(),
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
  exchangeGoogleCode: vi.fn(),
  getActionActor: vi.fn(),
  prisma: { providerConnection: { findUnique: vi.fn(), upsert: vi.fn() } },
  requireProjectScope: vi.fn(),
  storePendingGoogleOAuth: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: mocks.decryptProviderCredentials,
  decryptSecret: mocks.decryptSecret,
  encryptSecret: mocks.encryptSecret,
}));
vi.mock("./google-client", () => ({
  exchangeGoogleCode: mocks.exchangeGoogleCode,
  GOOGLE_AUTHORIZE_URL: "https://accounts.google.test/authorize",
  googleAnalyticsScopes: () => ["openid", "webmasters"],
  googleClientId: () => "client_id",
  googleRedirectUri: () => "https://example.test/api/integrations/google/callback",
}));
vi.mock("./google-oauth-pending", () => ({
  storePendingGoogleOAuth: mocks.storePendingGoogleOAuth,
}));

const state = {
  actorId: "user_1",
  issuedAt: Date.now(),
  projectId: "project_1",
  property: "",
  provider: "gsc",
  redirectUri: "https://example.test/api/integrations/google/callback",
  returnPath: "/app/integrations?connect=gsc",
};

describe("completeGoogleOAuthInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptSecret.mockReturnValue(JSON.stringify(state));
    mocks.cookieStore.get.mockReturnValue({ value: "encrypted_state" });
    mocks.getActionActor.mockResolvedValue({ id: "user_1", memberships: [], role: "owner" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.decryptProviderCredentials.mockReturnValue({});
    mocks.encryptSecret.mockReturnValue("encrypted");
    mocks.exchangeGoogleCode.mockResolvedValue({ refreshToken: "refresh_token" });
  });

  it("keeps GSC OAuth pending until a verified property is selected", async () => {
    await expect(
      completeGoogleOAuthInstall({ code: "code_1", state: "encrypted_state" }),
    ).resolves.toEqual({
      projectId: "project_1",
      provider: "gsc",
      returnPath: "/app/integrations?connect=gsc",
      status: "select",
    });

    expect(mocks.storePendingGoogleOAuth).toHaveBeenCalledWith({
      actorId: "user_1",
      projectId: "project_1",
      provider: "gsc",
      refreshToken: "refresh_token",
    });
    expect(mocks.prisma.providerConnection.upsert).not.toHaveBeenCalled();
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("google_oauth_state");
  });

  it("rejects a GA4 Measurement ID before credentials can be persisted", async () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({
        ...state,
        property: "G-Y67LRWFT7X",
        provider: "ga4",
      }),
    );

    await expect(
      completeGoogleOAuthInstall({ code: "code_1", state: "encrypted_state" }),
    ).rejects.toThrow("Measurement ID");

    expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();
    expect(mocks.prisma.providerConnection.upsert).not.toHaveBeenCalled();
  });

  it("rejects a GA4 Measurement ID before creating OAuth state", () => {
    expect(() =>
      createGoogleInstallState({
        actorId: "user_1",
        projectId: "project_1",
        property: "G-Y67LRWFT7X",
        provider: "ga4",
        redirectUri: "https://example.test/api/integrations/google/callback",
        returnPath: "/app/integrations?connect=ga4",
      }),
    ).toThrow("Measurement ID");

    expect(mocks.encryptSecret).not.toHaveBeenCalled();
  });

  it("keeps a GA4 resource name as its normalized pending property id", async () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({
        ...state,
        property: "properties/123456789",
        provider: "ga4",
      }),
    );
    await expect(
      completeGoogleOAuthInstall({ code: "code_1", state: "encrypted_state" }),
    ).resolves.toMatchObject({ provider: "ga4", status: "select" });

    expect(mocks.storePendingGoogleOAuth).toHaveBeenCalledWith({
      actorId: "user_1",
      projectId: "project_1",
      property: "123456789",
      provider: "ga4",
      refreshToken: "refresh_token",
    });
    expect(mocks.prisma.providerConnection.upsert).not.toHaveBeenCalled();
  });
});

describe("createGoogleInstallState return-target validation", () => {
  const base = {
    actorId: "user_1",
    projectId: "project_1",
    property: "",
    provider: "gsc" as const,
    redirectUri: "https://example.test/api/integrations/google/callback",
  };

  it("accepts an app-relative onboarding step-5 return path with context params", () => {
    expect(() =>
      createGoogleInstallState({
        ...base,
        returnPath: "/onboarding?step=5&projectId=prj_1&loc=US&device=desktop&device=mobile",
      }),
    ).not.toThrow();
  });

  it("rejects absolute or protocol-relative return targets", () => {
    for (const target of ["https://evil.test/onboarding", "//evil.test", "/onboarding\\@evil"]) {
      expect(() => createGoogleInstallState({ ...base, returnPath: target })).toThrow();
    }
  });
});
