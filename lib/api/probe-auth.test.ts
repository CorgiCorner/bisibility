import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticateBearer: vi.fn() }));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
  LEGACY_BEARER_PREFIXES: ["bsk_", "bsp_"],
  PERSONAL_TOKEN_PREFIX: "bsb_pat_live_",
  PROJECT_API_KEY_PREFIX: "bsb_key_",
}));

import { canReadDetailedHealth } from "./probe-auth";

function request(token?: string) {
  return new Request("https://example.com/api/v1/health", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

describe("health probe authorization", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("accepts the configured deployment token without database authentication", async () => {
    const token = "p".repeat(32);
    vi.stubEnv("INTERNAL_PROBE_TOKEN", token);

    await expect(canReadDetailedHealth(request(token))).resolves.toBe(true);
    expect(mocks.authenticateBearer).not.toHaveBeenCalled();
  });

  it("rejects missing, weak, and mismatched deployment tokens", async () => {
    vi.stubEnv("INTERNAL_PROBE_TOKEN", "too-short");
    await expect(canReadDetailedHealth(request("too-short"))).resolves.toBe(false);

    vi.stubEnv("INTERNAL_PROBE_TOKEN", "p".repeat(32));
    await expect(canReadDetailedHealth(request("q".repeat(32)))).resolves.toBe(false);
    await expect(canReadDetailedHealth(request())).resolves.toBe(false);
    expect(mocks.authenticateBearer).not.toHaveBeenCalled();
  });

  it("accepts valid API credentials and preauthenticated internal calls", async () => {
    mocks.authenticateBearer.mockResolvedValue({ kind: "project_key" });

    await expect(canReadDetailedHealth(request("bsb_key_valid"))).resolves.toBe(true);
    await expect(canReadDetailedHealth(request(), true)).resolves.toBe(true);
    expect(mocks.authenticateBearer).toHaveBeenCalledTimes(1);
  });

  it("falls back to the public response when credential storage is unavailable", async () => {
    mocks.authenticateBearer.mockRejectedValue(new Error("database unavailable"));

    await expect(canReadDetailedHealth(request("bsb_pat_live_valid"))).resolves.toBe(false);
  });
});
