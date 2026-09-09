import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launchSingleRankCheckRun: vi.fn(),
  loadSerpProviderChain: vi.fn(),
  projectFindUniqueOrThrow: vi.fn(),
  readAnalyticsSurfaceFromHeaders: vi.fn(),
  readConsentFromCookies: vi.fn(),
  trackServerEvent: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/analytics/server", () => ({
  readAnalyticsSurfaceFromHeaders: mocks.readAnalyticsSurfaceFromHeaders,
  readConsentFromCookies: mocks.readConsentFromCookies,
  trackServerEvent: mocks.trackServerEvent,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { project: { findUniqueOrThrow: mocks.projectFindUniqueOrThrow } },
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadSerpProviderChain,
}));
vi.mock("@/lib/rank-check/runs/launch-single", () => ({
  launchSingleRankCheckRun: mocks.launchSingleRankCheckRun,
}));
vi.mock("./_shared", async (importOriginal) => {
  const original = await importOriginal<typeof import("./_shared")>();
  return {
    ...original,
    getActionActor: vi.fn(async () => ({ id: "user_1" })),
    parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
      schema.parse(input),
    requireKeywordScope: vi.fn(async () => ({
      projectId: "project_1",
      projectIsSample: false,
      projectPublicId: "prj_abcdefghijklmnopqrstuvwx",
      publicId: "kw_abcdefghijklmnopqrstuvwx",
    })),
    revalidateRankCheckViews: vi.fn(),
  };
});

import { runFirstCheckPreview } from "./rank-check-preview";

describe("runFirstCheckPreview analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValue(125);
    mocks.projectFindUniqueOrThrow.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      isSample: false,
    });
    mocks.launchSingleRankCheckRun.mockResolvedValue({
      publicId: "run_abcdefghijklmnopqrstuvwx",
    });
    mocks.loadSerpProviderChain.mockResolvedValue([{ provider: "serpapi" }]);
    mocks.readAnalyticsSurfaceFromHeaders.mockResolvedValue("onboarding");
    mocks.readConsentFromCookies.mockResolvedValue({
      analytics: true,
      decidedAt: 1,
      replay: false,
      status: "decided",
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("emits the queued preview result with exact funnel properties", async () => {
    await expect(
      runFirstCheckPreview({ keywordId: "kw_abcdefghijklmnopqrstuvwx" }),
    ).resolves.toEqual({ runId: "run_abcdefghijklmnopqrstuvwx", status: "queued" });

    expect(mocks.trackServerEvent).toHaveBeenCalledWith("rank_check_preview_completed", {
      consent: { analytics: true, decidedAt: 1, replay: false, status: "decided" },
      distinctId: "user_1",
      properties: {
        duration_ms: 25,
        provider: "serpapi",
        status: "queued",
        surface: "onboarding",
      },
    });
  });
});
