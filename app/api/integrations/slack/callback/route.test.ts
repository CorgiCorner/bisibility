import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  completeSlackOAuthInstall: vi.fn(),
}));

vi.mock("@/lib/actions/slack", () => ({
  completeSlackOAuthInstall: mocks.completeSlackOAuthInstall,
}));
vi.mock("@/lib/integrations/oauth-url", () => ({
  oauthResultUrl: (_requestUrl: string, returnPath: string) =>
    new URL(returnPath, "https://bisibility.test"),
}));

function request(query: string) {
  return new Request(
    `https://localhost:3000/api/integrations/slack/callback?${query}`,
  ) as NextRequest;
}

describe("GET /api/integrations/slack/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the project-scoped return path carried through OAuth state", async () => {
    mocks.completeSlackOAuthInstall.mockResolvedValue({
      projectId: "project_1",
      returnPath: "/app/prj_1/alerts",
    });

    const response = await GET(request("code=code_1&state=state_1"));

    expect(response.headers.get("location")).toBe(
      "https://bisibility.test/app/prj_1/alerts?slack=connected&projectId=project_1",
    );
  });

  it("falls back to the bare app entry for a provider error before state is parsed", async () => {
    const response = await GET(request("error=access_denied"));

    expect(response.headers.get("location")).toBe("https://bisibility.test/app?slack=error");
    expect(mocks.completeSlackOAuthInstall).not.toHaveBeenCalled();
  });

  it("falls back to the bare app entry when callback completion fails", async () => {
    mocks.completeSlackOAuthInstall.mockRejectedValue(new Error("Invalid state"));

    const response = await GET(request("code=code_1&state=invalid"));

    expect(response.headers.get("location")).toBe("https://bisibility.test/app?slack=error");
  });
});
