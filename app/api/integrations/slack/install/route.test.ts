import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  createSlackInstallUrl: vi.fn(),
  getActionActor: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/actions/slack", () => ({
  createSlackInstallUrl: mocks.createSlackInstallUrl,
}));
vi.mock("@/lib/integrations/oauth-url", () => ({
  oauthRequestOrigin: () => "https://app.example.com",
  oauthResultUrl: (_requestUrl: string, returnPath: string) =>
    new URL(returnPath, "https://app.example.com"),
}));

function request(query: string) {
  return new Request(
    `https://app.example.com/api/integrations/slack/install?${query}`,
  ) as NextRequest;
}

const projectId = "prj_a00000000000000000000000";

describe("GET /api/integrations/slack/install", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.createSlackInstallUrl.mockReturnValue(
      "https://slack.example.com/authorize?state=state_1",
    );
  });

  it("stores a project-scoped default return path in OAuth state", async () => {
    const response = await GET(request(`projectId=${projectId}`));

    expect(response.headers.get("location")).toBe(
      "https://slack.example.com/authorize?state=state_1",
    );
    expect(mocks.createSlackInstallUrl).toHaveBeenCalledWith({
      actorId: "user_1",
      origin: "https://app.example.com",
      projectId: "project_1",
      returnPath: `/app/${projectId}/alerts`,
    });
  });

  it("falls back to the bare app entry when project resolution fails", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("Project not found"));

    const response = await GET(request("projectId=missing"));

    expect(response.headers.get("location")).toBe("https://app.example.com/app?slack=error");
  });

  it.each(["project_db_1", "kw_a00000000000000000000000"])(
    "rejects project ID %s before authorization",
    async (invalidId) => {
      const response = await GET(request(`projectId=${invalidId}`));

      expect(response.headers.get("location")).toBe("https://app.example.com/app?slack=error");
      expect(mocks.getActionActor).not.toHaveBeenCalled();
      expect(mocks.requireProjectScope).not.toHaveBeenCalled();
      expect(mocks.createSlackInstallUrl).not.toHaveBeenCalled();
    },
  );
});
