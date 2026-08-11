import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
  createGoogleInstallUrl: vi.fn(),
  getActionActor: vi.fn(),
  requireProjectScope: vi.fn(),
  reusableGoogleInstallUrl: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/integrations/oauth-url", () => ({
  oauthRequestOrigin: () => "https://app.example.com",
  oauthResultUrl: (_requestUrl: string, returnPath: string) =>
    new URL(returnPath, "https://app.example.com"),
}));
vi.mock("@/lib/providers/analytics/google-oauth", () => ({
  createGoogleInstallUrl: mocks.createGoogleInstallUrl,
  GOOGLE_OAUTH_STATE_COOKIE: "google_oauth_state",
  GOOGLE_OAUTH_STATE_TTL_MS: 600_000,
  reusableGoogleInstallUrl: mocks.reusableGoogleInstallUrl,
}));

function request(query: string) {
  return new Request(
    `https://app.example.com/api/integrations/google/install?${query}`,
  ) as NextRequest;
}

const projectId = "prj_a00000000000000000000000";

describe("GET /api/integrations/google/install", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.createGoogleInstallUrl.mockReturnValue(
      "https://accounts.example.com/authorize?state=state_1",
    );
    mocks.cookieStore.get.mockReturnValue(undefined);
    mocks.reusableGoogleInstallUrl.mockReturnValue(null);
  });

  it("starts GSC OAuth without a manually entered property", async () => {
    const response = await GET(request(`projectId=${projectId}&provider=gsc`));

    expect(response.headers.get("location")).toBe(
      "https://accounts.example.com/authorize?state=state_1",
    );
    expect(mocks.createGoogleInstallUrl).toHaveBeenCalledWith({
      actorId: "user_1",
      origin: "https://app.example.com",
      projectId: "project_1",
      property: undefined,
      provider: "gsc",
      returnPath: `/app/${projectId}/integrations`,
    });
  });

  it("starts GA4 OAuth before property selection", async () => {
    const response = await GET(request(`projectId=${projectId}&provider=ga4`));

    expect(response.headers.get("location")).toBe(
      "https://accounts.example.com/authorize?state=state_1",
    );
    expect(mocks.createGoogleInstallUrl).toHaveBeenCalledWith({
      actorId: "user_1",
      origin: "https://app.example.com",
      projectId: "project_1",
      property: undefined,
      provider: "ga4",
      returnPath: `/app/${projectId}/integrations`,
    });
  });

  it("redirects to the live flow without reissuing state or rewriting the cookie", async () => {
    mocks.cookieStore.get.mockReturnValue({ value: "state_live" });
    mocks.reusableGoogleInstallUrl.mockReturnValue(
      "https://accounts.example.com/authorize?state=state_live",
    );

    const response = await GET(request(`projectId=${projectId}&provider=gsc`));

    expect(response.headers.get("location")).toBe(
      "https://accounts.example.com/authorize?state=state_live",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.createGoogleInstallUrl).not.toHaveBeenCalled();
    expect(mocks.reusableGoogleInstallUrl).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "user_1", projectId: "project_1", state: "state_live" }),
    );
  });

  it.each(["project_db_1", "kw_a00000000000000000000000"])(
    "rejects project ID %s before authorization",
    async (invalidId) => {
      const response = await GET(request(`projectId=${invalidId}&provider=gsc`));

      expect(response.headers.get("location")).toBe("https://app.example.com/app?google=error");
      expect(mocks.getActionActor).not.toHaveBeenCalled();
      expect(mocks.requireProjectScope).not.toHaveBeenCalled();
      expect(mocks.createGoogleInstallUrl).not.toHaveBeenCalled();
    },
  );
});
