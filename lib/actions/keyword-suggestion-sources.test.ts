import { beforeEach, describe, expect, it, vi } from "vitest";
import { listKeywordSuggestionSources } from "./keyword-suggestion-sources";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  connection: vi.fn(),
  ranked: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findFirst: mocks.connection } },
}));
vi.mock("@/lib/ranked-keywords/service", () => ({
  listEligibleRankedKeywordConnections: mocks.ranked,
}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
}));

describe("keyword suggestion sources", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({ id: "user_1" });
    mocks.scope.mockResolvedValue({ id: "internal_project", domain: "example.com" });
    mocks.connection.mockResolvedValue({ publicId: "conn_gsc" });
    mocks.ranked.mockResolvedValue([
      { id: "conn_dfs", label: "DataForSEO", provider: "dataforseo" },
    ]);
  });
  it("authorizes the project before reading connected sources and returns only picker metadata", async () => {
    await expect(listKeywordSuggestionSources({ projectId: "prj_1" })).resolves.toEqual({
      domain: "example.com",
      searchConsole: true,
      rankedConnections: [{ id: "conn_dfs", label: "DataForSEO", provider: "dataforseo" }],
    });
    expect(mocks.scope).toHaveBeenCalledWith({ id: "user_1" }, "read", "prj_1", {
      type: "project",
    });
    expect(mocks.connection).toHaveBeenCalledWith({
      select: { publicId: true },
      where: {
        projectId: "internal_project",
        provider: "gsc",
        enabled: true,
        status: "connected",
      },
    });
    expect(mocks.ranked).toHaveBeenCalledWith("internal_project");
  });
  it("does not read sources after authorization fails", async () => {
    mocks.scope.mockRejectedValue(new Error("Forbidden"));
    await expect(listKeywordSuggestionSources({ projectId: "prj_other" })).rejects.toThrow(
      "Forbidden",
    );
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.ranked).not.toHaveBeenCalled();
  });
  it("handles a project without connections", async () => {
    mocks.connection.mockResolvedValue(null);
    mocks.ranked.mockResolvedValue([]);
    await expect(listKeywordSuggestionSources({ projectId: "prj_1" })).resolves.toEqual({
      domain: "example.com",
      searchConsole: false,
      rankedConnections: [],
    });
  });
});
