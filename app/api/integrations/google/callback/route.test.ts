import { GoogleOAuthInstallError } from "@/lib/integrations/google-oauth-failure";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  completeGoogleOAuthInstall: vi.fn(),
  googleOAuthReturnContextFromState: vi.fn(),
}));

vi.mock("@/lib/providers/analytics/google-oauth", () => ({
  completeGoogleOAuthInstall: mocks.completeGoogleOAuthInstall,
  googleOAuthReturnContextFromState: mocks.googleOAuthReturnContextFromState,
}));

function callbackRequest(query: string) {
  return new Request(
    `https://localhost:3000/api/integrations/google/callback?${query}`,
  ) as NextRequest;
}

describe("GET /api/integrations/google/callback", () => {
  let logged: unknown[][];

  beforeEach(() => {
    vi.stubEnv("SITE_URL", "https://bisibility.com");
    logged = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    mocks.googleOAuthReturnContextFromState.mockReturnValue({
      projectId: "prj_1",
      provider: "gsc",
      returnPath: "/app/prj_1/integrations",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("redirects an authorized onboarding flow to property selection", async () => {
    mocks.completeGoogleOAuthInstall.mockResolvedValue({
      projectId: "internal_project_id",
      provider: "gsc",
      returnPath: "/onboarding?step=3&projectId=prj_1",
      status: "select",
    });

    const response = await GET(callbackRequest("code=code_1&state=state_1"));

    expect(response.headers.get("location")).toBe(
      "https://bisibility.com/onboarding?step=3&projectId=prj_1&google=select&connect=gsc&provider=gsc",
    );
  });

  it("redirects an OAuth error to the public origin", async () => {
    mocks.googleOAuthReturnContextFromState.mockReturnValue({
      projectId: "internal_project_id",
      provider: "gsc",
      returnPath: "/onboarding?step=3&projectId=prj_1",
    });

    const response = await GET(callbackRequest("error=access_denied&state=state_1"));

    expect(response.headers.get("location")).toBe(
      "https://bisibility.com/onboarding?step=3&projectId=prj_1&google=error&connect=gsc&provider=gsc&reason=google_denied",
    );
  });

  it("falls back to the bare app entry when OAuth state cannot provide project context", async () => {
    mocks.googleOAuthReturnContextFromState.mockReturnValue(null);

    const response = await GET(callbackRequest("error=access_denied&state=invalid"));

    expect(response.headers.get("location")).toBe(
      "https://bisibility.com/app?google=error&reason=google_denied",
    );
  });

  it("keeps Google's own error code in the log while showing one declined message", async () => {
    await GET(callbackRequest("error=admin_policy_enforced&state=state_1"));

    expect(logged[0]?.[1]).toEqual({
      googleError: "admin_policy_enforced",
      projectId: "prj_1",
      provider: "gsc",
      reason: "google_denied",
    });
  });

  it("refuses to log a Google error code it does not recognize", async () => {
    await GET(callbackRequest(`error=${encodeURIComponent("<script>alert(1)</script>")}`));

    expect(logged[0]?.[1]).toMatchObject({ googleError: "unrecognized" });
    expect(JSON.stringify(logged)).not.toContain("script");
  });

  it("carries a classified failure back to the surface the install started from", async () => {
    mocks.googleOAuthReturnContextFromState.mockReturnValue(null);
    mocks.completeGoogleOAuthInstall.mockRejectedValue(
      new GoogleOAuthInstallError("state_expired", "Google OAuth state has expired.", {
        projectId: "project_1",
        provider: "gsc",
        returnPath: "/onboarding?step=3&projectId=prj_1",
      }),
    );

    const response = await GET(callbackRequest("code=code_1&state=state_1"));

    expect(response.headers.get("location")).toBe(
      "https://bisibility.com/onboarding?step=3&projectId=prj_1&google=error&connect=gsc&provider=gsc&reason=state_expired",
    );
  });

  it("logs one non-sensitive line per failure", async () => {
    mocks.completeGoogleOAuthInstall.mockRejectedValue(
      new GoogleOAuthInstallError("token_exchange", "invalid_grant: code already redeemed", {
        projectId: "project_1",
        provider: "gsc",
        returnPath: "/app/prj_1/integrations",
      }),
    );

    await GET(callbackRequest("code=super_secret_code&state=super_secret_state"));

    expect(logged).toHaveLength(1);
    expect(logged[0]).toEqual([
      "[google-oauth] install failed",
      { projectId: "project_1", provider: "gsc", reason: "token_exchange" },
    ]);
    expect(JSON.stringify(logged)).not.toContain("super_secret");
  });

  it("omits the reason for a failure it cannot classify", async () => {
    mocks.completeGoogleOAuthInstall.mockRejectedValue(new Error("Google OAuth code is missing."));

    const response = await GET(callbackRequest("state=state_1"));

    expect(response.headers.get("location")).toBe(
      "https://bisibility.com/app/prj_1/integrations?google=error&connect=gsc&provider=gsc",
    );
    expect(logged[0]?.[1]).toEqual({
      causeClass: "Error",
      causeMessage: "Google OAuth code is missing.",
      projectId: "prj_1",
      provider: "gsc",
      reason: "unclassified",
    });
  });

  it("keeps a successful install off the failure log", async () => {
    mocks.completeGoogleOAuthInstall.mockResolvedValue({
      projectId: "project_1",
      provider: "gsc",
      returnPath: "/app/prj_1/integrations",
      status: "select",
    });

    await GET(callbackRequest("code=code_1&state=state_1"));

    expect(logged).toHaveLength(0);
  });

  it("logs cause class and redacted message for unclassified crashes without leaking secrets into the redirect", async () => {
    mocks.completeGoogleOAuthInstall.mockRejectedValue(
      new Error(
        "Provider credentials could not be decrypted. refresh token: 1//oauth_refresh_fixture",
      ),
    );

    const response = await GET(callbackRequest("code=code_1&state=state_1"));
    const location = response.headers.get("location") ?? "";

    expect(logged[0]?.[0]).toBe("[google-oauth] install failed");
    expect(logged[0]?.[1]).toMatchObject({
      causeClass: "Error",
      projectId: "prj_1",
      provider: "gsc",
      reason: "unclassified",
    });
    expect(logged[0]?.[1]).toHaveProperty("causeMessage");
    const loggedEntry = logged[0]?.[1] as { causeMessage?: unknown };
    expect(typeof loggedEntry.causeMessage).toBe("string");
    const causeMessage = loggedEntry.causeMessage as string;
    expect(causeMessage).toContain("[REDACTED]");
    expect(causeMessage).not.toContain("1//oauth_refresh_fixture");
    expect(location).not.toContain("causeMessage");
    expect(location).not.toContain("1//oauth_refresh_fixture");
    expect(location).not.toContain("reason=credentials_decrypt");
    expect(location).not.toContain("reason=token_exchange");
    expect(location).not.toContain("reason=store_failed");
  });
});
