import { Prisma } from "@/lib/generated/prisma/client";
import {
  type GoogleOAuthFailureReason,
  GoogleOAuthInstallError,
} from "@/lib/integrations/google-oauth-failure";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCredentialsDecryptError } from "@/lib/providers/crypto";
import { ProviderHttpError } from "@/lib/providers/failure-class";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeGoogleOAuthInstall,
  createGoogleInstallState,
  googleOAuthReturnContextFromState,
  reusableGoogleInstallUrl,
} from "./google-oauth";

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
vi.mock("@/lib/providers/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers/crypto")>()),
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

describe("completeGoogleOAuthInstall failure classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptSecret.mockReturnValue(JSON.stringify(state));
    mocks.cookieStore.get.mockReturnValue({ value: "encrypted_state" });
    mocks.getActionActor.mockResolvedValue({ id: "user_1", memberships: [], role: "owner" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.decryptProviderCredentials.mockReturnValue({});
    mocks.exchangeGoogleCode.mockResolvedValue({ refreshToken: "refresh_token" });
    mocks.storePendingGoogleOAuth.mockResolvedValue(undefined);
  });

  async function reasonOf(): Promise<GoogleOAuthFailureReason | "none"> {
    try {
      await completeGoogleOAuthInstall({ code: "code_1", state: "encrypted_state" });
      return "none";
    } catch (error) {
      if (error instanceof GoogleOAuthInstallError) return error.reason;
      throw error;
    }
  }

  it("reports state_expired once the TTL has passed", async () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({ ...state, issuedAt: Date.now() - 11 * 60 * 1000 }),
    );

    await expect(reasonOf()).resolves.toBe("state_expired");
  });

  it.each([undefined, { value: "other_state" }])(
    "reports state_cookie_mismatch for cookie %o",
    async (cookie) => {
      mocks.cookieStore.get.mockReturnValue(cookie);

      await expect(reasonOf()).resolves.toBe("state_cookie_mismatch");
    },
  );

  it("reports actor_mismatch when another session finishes the flow", async () => {
    mocks.getActionActor.mockResolvedValue({ id: "user_2", memberships: [], role: "owner" });

    await expect(reasonOf()).resolves.toBe("actor_mismatch");
  });

  it("reports token_exchange when Google refuses the code", async () => {
    mocks.exchangeGoogleCode.mockRejectedValue(new Error("invalid_grant"));

    await expect(reasonOf()).resolves.toBe("token_exchange");
  });

  it("reports no_refresh_token when no stored token can stand in", async () => {
    mocks.exchangeGoogleCode.mockResolvedValue({ refreshToken: null });

    await expect(reasonOf()).resolves.toBe("no_refresh_token");
  });

  it("reports store_failed when persisting the pending install throws", async () => {
    mocks.storePendingGoogleOAuth.mockRejectedValue(new Error("db is down"));

    await expect(reasonOf()).resolves.toBe("store_failed");
  });

  it("carries the project, provider and return target so the redirect keeps its context", async () => {
    mocks.exchangeGoogleCode.mockRejectedValue(new Error("invalid_grant"));

    await expect(
      completeGoogleOAuthInstall({ code: "code_1", state: "encrypted_state" }),
    ).rejects.toMatchObject({
      projectId: "project_1",
      provider: "gsc",
      returnPath: "/app/integrations?connect=gsc",
    });
  });

  it("keeps a successful install unclassified", async () => {
    await expect(reasonOf()).resolves.toBe("none");
  });

  it("reports credentials_decrypt when stored provider credentials cannot be decrypted", async () => {
    mocks.exchangeGoogleCode.mockResolvedValue({ refreshToken: null });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "encrypted_blob",
    });
    mocks.decryptProviderCredentials.mockImplementation(() => {
      throw new Error("Provider credentials could not be decrypted.");
    });

    await expect(reasonOf()).resolves.toBe("credentials_decrypt");
  });

  it("does not decrypt stored credentials when the exchange returns a fresh token", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "encrypted_blob",
    });
    mocks.exchangeGoogleCode.mockResolvedValue({ refreshToken: "fresh_refresh_token" });
    mocks.decryptProviderCredentials.mockImplementation(() => {
      throw new ProviderCredentialsDecryptError(new Error("unsupported format"));
    });

    await expect(
      completeGoogleOAuthInstall({ code: "code_1", state: "encrypted_state" }),
    ).resolves.toMatchObject({ status: "select" });
    expect(mocks.decryptProviderCredentials).not.toHaveBeenCalled();
  });

  it("reports credentials_decrypt when the typed decrypt error is thrown", async () => {
    mocks.exchangeGoogleCode.mockResolvedValue({ refreshToken: null });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "encrypted_blob",
    });
    mocks.decryptProviderCredentials.mockImplementation(() => {
      throw new ProviderCredentialsDecryptError(new Error("unsupported format"));
    });

    await expect(reasonOf()).resolves.toBe("credentials_decrypt");
  });

  it("reports token_exchange when the exchange throws a ProviderHttpError", async () => {
    mocks.exchangeGoogleCode.mockRejectedValue(new ProviderHttpError(400, "bad request"));

    await expect(reasonOf()).resolves.toBe("token_exchange");
  });

  it("reports token_exchange when the exchange throws a ProviderAuthError", async () => {
    mocks.exchangeGoogleCode.mockRejectedValue(new ProviderAuthError("google"));

    await expect(reasonOf()).resolves.toBe("token_exchange");
  });

  it("reports store_failed when a Prisma persistence error is thrown", async () => {
    mocks.storePendingGoogleOAuth.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        clientVersion: "7.8.0",
        code: "P2002",
      }),
    );

    await expect(reasonOf()).resolves.toBe("store_failed");
  });
});

describe("googleOAuthReturnContextFromState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still names the originating surface for an expired state", () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({ ...state, issuedAt: Date.now() - 24 * 60 * 60 * 1000 }),
    );

    expect(googleOAuthReturnContextFromState("encrypted_state")).toEqual({
      projectId: "project_1",
      provider: "gsc",
      returnPath: "/app/integrations?connect=gsc",
    });
  });

  it.each([null, "garbage"])("returns no context for state %s", (raw) => {
    mocks.decryptSecret.mockImplementation(() => {
      throw new Error("bad payload");
    });

    expect(googleOAuthReturnContextFromState(raw)).toBeNull();
  });
});

describe("reusableGoogleInstallUrl", () => {
  const install = {
    actorId: "user_1",
    origin: "https://example.test",
    projectId: "project_1",
    property: undefined,
    provider: "gsc" as const,
    returnPath: "/app/integrations?connect=gsc",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptSecret.mockReturnValue(JSON.stringify(state));
  });

  it("sends the user back to Google with the state the cookie already holds", () => {
    const url = reusableGoogleInstallUrl({ ...install, state: "encrypted_state" });

    expect(url).not.toBeNull();
    expect(new URL(url ?? "").searchParams.get("state")).toBe("encrypted_state");
    expect(mocks.encryptSecret).not.toHaveBeenCalled();
  });

  it("mints a new state when the browser carries none", () => {
    expect(reusableGoogleInstallUrl({ ...install, state: null })).toBeNull();
  });

  it("mints a new state once too little of the TTL is left to finish consent", () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({ ...state, issuedAt: Date.now() - 9 * 60 * 1000 }),
    );

    expect(reusableGoogleInstallUrl({ ...install, state: "encrypted_state" })).toBeNull();
  });

  it("still reuses a state with most of its TTL left", () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({ ...state, issuedAt: Date.now() - 60 * 1000 }),
    );

    expect(reusableGoogleInstallUrl({ ...install, state: "encrypted_state" })).not.toBeNull();
  });

  it("mints a new state once the cookie's state has expired", () => {
    mocks.decryptSecret.mockReturnValue(
      JSON.stringify({ ...state, issuedAt: Date.now() - 11 * 60 * 1000 }),
    );

    expect(reusableGoogleInstallUrl({ ...install, state: "encrypted_state" })).toBeNull();
  });

  it("mints a new state when the cookie cannot be decrypted", () => {
    mocks.decryptSecret.mockImplementation(() => {
      throw new Error("bad payload");
    });

    expect(reusableGoogleInstallUrl({ ...install, state: "encrypted_state" })).toBeNull();
  });

  it.each([
    ["actor", { actorId: "user_2" }],
    ["project", { projectId: "project_2" }],
    ["provider", { provider: "ga4" as const }],
    ["property", { property: "sc-domain:example.com" }],
    ["return target", { returnPath: "/onboarding?step=3" }],
  ])("mints a new state when the %s differs", (_label, override) => {
    expect(
      reusableGoogleInstallUrl({ ...install, ...override, state: "encrypted_state" }),
    ).toBeNull();
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
