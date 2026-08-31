import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pending: vi.fn() }));

vi.mock("@/lib/providers/analytics/google-oauth-pending", () => ({
  getPendingGoogleOAuthSetup: mocks.pending,
}));

const { resolveSearchInsightsOauthReturn } = await import("./oauth-return");

const setup = { properties: [], provider: "gsc" as const };

describe("resolveSearchInsightsOauthReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.mockResolvedValue(setup);
  });

  it("finishes the property choice on the page the consent screen returned to", async () => {
    await expect(
      resolveSearchInsightsOauthReturn("prj_1", { google: "select", provider: "gsc" }),
    ).resolves.toEqual({ error: null, provider: "gsc", setup });
    expect(mocks.pending).toHaveBeenCalledWith("prj_1");
  });

  it("passes the analytics provider through the same seam", async () => {
    await resolveSearchInsightsOauthReturn("prj_1", { google: "select", provider: "ga4" });

    expect(mocks.pending).toHaveBeenCalledWith("prj_1");
  });

  it("keeps the provider on GA4 callback failures", async () => {
    await expect(
      resolveSearchInsightsOauthReturn("prj_1", {
        google: "error",
        provider: "ga4",
        reason: "access_denied",
      }),
    ).resolves.toMatchObject({ provider: "ga4", setup: null });
  });

  it("explains a refused consent instead of leaving the page looking unconnected", async () => {
    const result = await resolveSearchInsightsOauthReturn("prj_1", {
      google: "error",
      provider: "gsc",
      reason: "access_denied",
    });

    expect(result.setup).toBeNull();
    expect(result.error).toBeTruthy();
    expect(mocks.pending).not.toHaveBeenCalled();
  });

  it("ignores a return that names no Google provider", async () => {
    await expect(
      resolveSearchInsightsOauthReturn("prj_1", { google: "select", provider: "serp" }),
    ).resolves.toEqual({ error: null, provider: null, setup: null });
    await expect(resolveSearchInsightsOauthReturn("prj_1", {})).resolves.toEqual({
      error: null,
      provider: null,
      setup: null,
    });
    expect(mocks.pending).not.toHaveBeenCalled();
  });
});
