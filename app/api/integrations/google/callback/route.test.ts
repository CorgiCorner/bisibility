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
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "https://bisibility.com");
    mocks.googleOAuthReturnContextFromState.mockReturnValue({
      projectId: "prj_1",
      provider: "gsc",
      returnPath: "/app/prj_1/integrations",
    });
  });

  afterEach(() => {
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
      "https://bisibility.com/onboarding?step=3&projectId=prj_1&google=error&connect=gsc&provider=gsc",
    );
  });

  it("falls back to the bare app entry when OAuth state cannot provide project context", async () => {
    mocks.googleOAuthReturnContextFromState.mockReturnValue(null);

    const response = await GET(callbackRequest("error=access_denied&state=invalid"));

    expect(response.headers.get("location")).toBe("https://bisibility.com/app?google=error");
  });
});
