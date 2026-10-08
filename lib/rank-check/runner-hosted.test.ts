import type { SerpProvider } from "@/lib/providers/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  startExecution: vi.fn(),
  hostedRankEstimate: vi.fn(),
  fetchRank: vi.fn(),
  attribution: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findUnique: mocks.connection } },
}));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccess: vi.fn(),
}));
vi.mock("@/lib/providers/execution-extension", () => ({
  hostedRankCheckEstimatedCostCents: mocks.hostedRankEstimate,
  startDeploymentExecution: mocks.startExecution,
}));
vi.mock("@/lib/provider-usage/tag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-usage/tag")>()),
  createProviderRequestAttribution: mocks.attribution,
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn().mockResolvedValue({ success: true }),
  writeCooldown: vi.fn(),
}));

import { runCheck } from "./runner";

const attribution = {
  context: {
    correlationId: "check_1",
    feature: "rank_check" as const,
    projectId: "project_1",
    source: "app" as const,
    trigger: "manual" as const,
  },
  tag: "fixture-tag",
};

function input(provider: SerpProvider) {
  return {
    connection: {
      credentials: { login: "fixture", password: "fixture" },
      id: "connection_1",
      provider: "dataforseo",
    },
    keyword: {
      device: "desktop" as const,
      domain: "example.com",
      id: "keyword_1",
      location: {
        gl: "us",
        hl: "en",
        primaryGeoCode: null,
        primaryGeoName: "United States",
        secondaryGeoName: "United States",
      },
      text: "rank fixture",
    },
    projectId: "project_1",
    provider,
    providerUsage: attribution,
    rankCheckId: "check_1",
    schedule: { frequency: "manual" as const },
  };
}

const provider: SerpProvider = {
  id: "dataforseo",
  label: "Fixture",
  testConnection: vi.fn(),
  fetchRank: mocks.fetchRank,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.attribution.mockResolvedValue(attribution);
  mocks.hostedRankEstimate.mockReturnValue(null);
  mocks.fetchRank.mockResolvedValue({ checkedAt: new Date(), costCents: 0.2, position: 2 });
});

describe("live rank deployment boundary", () => {
  it("uses own credentials without calling the private execution port", async () => {
    mocks.connection.mockResolvedValue({
      credentialSource: "own",
      projectId: "project_1",
      provider: "dataforseo",
    });
    await runCheck(input(provider));
    expect(mocks.startExecution).not.toHaveBeenCalled();
    expect(mocks.fetchRank).toHaveBeenCalledOnce();
  });

  it("refuses an unavailable hosted deployment before provider I/O or own decryption", async () => {
    mocks.connection.mockResolvedValue({
      credentialSource: "hosted",
      projectId: "project_1",
      provider: "dataforseo",
    });
    mocks.startExecution.mockResolvedValue(null);
    const request = input(provider);
    request.connection.credentials = { login: "ignored", password: "ignored" };
    await expect(runCheck(request)).rejects.toMatchObject({
      name: "ProviderUsagePersistenceError",
    });
    expect(mocks.startExecution).toHaveBeenCalledOnce();
    expect(mocks.fetchRank).not.toHaveBeenCalled();
  });
});
