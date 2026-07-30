import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queuedRankCheckRoute } from "./queued-routing";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  resolveCredentials: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { project: { findUnique: mocks.findProject } },
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: mocks.resolveCredentials,
}));

const group = {
  claims: [
    {
      advancedCheckAt: "2026-07-30T00:00:00.000Z",
      dueCheckAt: "2026-07-29T00:00:00.000Z",
      keywordId: "keyword_1",
      stateVersion: "123",
    },
  ],
  device: "desktop" as const,
  domain: "example.com",
  keywordIds: ["keyword_1"],
  locationId: "location_1",
  projectId: "project_1",
};

function project(provider = "dataforseo") {
  return {
    owner: { deactivatedAt: null },
    providerConnections: [
      {
        credentialsEncrypted: "encrypted",
        provider,
      },
    ],
    writeMode: "active",
  };
}

describe("queued rank-check routing", () => {
  beforeEach(() => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    mocks.findProject.mockResolvedValue(project());
    mocks.resolveCredentials.mockReturnValue({ login: "login", password: "password" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("is an exact legacy no-op while the queued gate is off", async () => {
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "");

    await expect(queuedRankCheckRoute(group)).resolves.toEqual({
      mode: "legacy",
      reason: "queued_dataforseo_disabled",
    });
    expect(mocks.findProject).not.toHaveBeenCalled();
  });

  it("keeps other providers on the existing Live workflow", async () => {
    mocks.findProject.mockResolvedValue(project("serpapi"));

    await expect(queuedRankCheckRoute(group)).resolves.toEqual({
      mode: "legacy",
      reason: "primary_provider_not_dataforseo",
    });
  });

  it("selects queued Standard work only for an eligible DataForSEO primary", async () => {
    await expect(queuedRankCheckRoute(group)).resolves.toEqual({
      mode: "queued",
      provider: "dataforseo",
    });
  });

  it("defers missing credentials instead of fanning out to paid Live calls", async () => {
    mocks.resolveCredentials.mockReturnValue({ login: "", password: "" });

    await expect(queuedRankCheckRoute(group)).resolves.toEqual({
      mode: "deferred",
      reason: "credentials_unavailable",
    });
  });
});
