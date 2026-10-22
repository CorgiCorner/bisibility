import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOverviewMocks, keyword, now, resetOverviewMocks } from "./overview-query.test-fixture";

const readiness = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/first-check-readiness", () => ({ readFirstCheckSourceReady: readiness }));
const { getOverview } = await import("./overview");
const mocks = getOverviewMocks();

describe("overview first-check readiness projection", () => {
  beforeEach(() => {
    resetOverviewMocks();
    readiness.mockReset().mockResolvedValue(true);
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword({ publicId: "kw_pending" })]);
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        credentialSource: "hosted",
        credentialsEncrypted: "server-only-value",
        enabled: true,
        kind: "serp",
        priority: 0,
        provider: "dataforseo",
        status: "connected",
      },
    ]);
  });
  it("projects ready selected credits as a boolean without exposing stored credentials", async () => {
    const view = await getOverview("prj_1", { now });
    expect(view.firstCheckSourceReady).toBe(true);
    expect(readiness).toHaveBeenCalledWith(
      "project_1",
      expect.arrayContaining([expect.objectContaining({ credentialSource: "hosted" })]),
      now,
    );
    expect(JSON.stringify(view)).not.toContain("server-only-value");
    expect(JSON.stringify(view)).not.toContain("credentialsEncrypted");
  });
  it("does not advertise first check just because a connection is marked connected", async () => {
    readiness.mockResolvedValue(false);
    const view = await getOverview("prj_1", { now });
    expect(view.serpProviderState).toBe("ready");
    expect(view.firstCheckSourceReady).toBe(false);
  });
  it("skips funding reads once rankings exist", async () => {
    mocks.prisma.rankCheck.findFirst.mockResolvedValue({ checkedAt: now, provider: "dataforseo" });
    expect((await getOverview("prj_1", { now })).firstCheckSourceReady).toBe(false);
    expect(readiness).not.toHaveBeenCalled();
  });
});
