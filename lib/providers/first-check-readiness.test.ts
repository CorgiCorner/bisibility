import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deployment: vi.fn(), decrypt: vi.fn() }));
vi.mock("./first-check-readiness-extension", () => ({
  readDeploymentFirstCheckSourceReady: mocks.deployment,
}));
vi.mock("./crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));

import {
  type FirstCheckConnection,
  firstCheckOwnKeyReady,
  readFirstCheckSourceReady,
} from "./first-check-readiness";

const own: FirstCheckConnection = {
  credentialSource: "own",
  credentialsEncrypted: "encrypted",
  enabled: true,
  kind: "serp",
  priority: 0,
  provider: "serpapi",
  status: "connected",
};
describe("first-check source readiness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.decrypt.mockReturnValue({ apiKey: "stored-key" });
    mocks.deployment.mockImplementation(async (_project, _connection, ready) => ready);
  });
  it("accepts a selected connected own key without returning credential data", async () => {
    expect(await readFirstCheckSourceReady("project", [own])).toBe(true);
    expect(mocks.deployment).toHaveBeenCalledWith("project", own, true, expect.any(Date));
  });
  it("requires DataForSEO login and password rather than an unrelated API key", () => {
    expect(firstCheckOwnKeyReady({ ...own, provider: "dataforseo" })).toBe(false);
    mocks.decrypt.mockReturnValue({ login: "login", password: "password" });
    expect(firstCheckOwnKeyReady({ ...own, provider: "dataforseo" })).toBe(true);
  });
  it.each([
    { enabled: false },
    { status: "needs_reauth" },
    { credentialsEncrypted: null },
    { provider: "unknown" },
  ])("rejects unusable own configuration %o", async (change) => {
    mocks.decrypt.mockImplementation((value) => (value ? { apiKey: "stored" } : {}));
    expect(await readFirstCheckSourceReady("project", [{ ...own, ...change }])).toBe(false);
  });
  it("fails closed on decryption errors, without an environment-key fallback", () => {
    mocks.decrypt.mockImplementation(() => {
      throw new Error("decryption failed");
    });
    expect(firstCheckOwnKeyReady(own)).toBe(false);
  });
  it("keeps hosted readiness under the deployment decision", async () => {
    const hosted = { ...own, credentialSource: "hosted", credentialsEncrypted: null };
    mocks.deployment.mockResolvedValue(true);
    expect(await readFirstCheckSourceReady("project", [hosted])).toBe(true);
    expect(mocks.deployment).toHaveBeenCalledWith("project", hosted, false, expect.any(Date));
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it("uses the selected primary source rather than an unselected own-key fallback", async () => {
    const hosted = { ...own, credentialSource: "hosted", provider: "dataforseo" };
    expect(await readFirstCheckSourceReady("project", [hosted, { ...own, priority: 1 }])).toBe(
      false,
    );
    expect(mocks.deployment).toHaveBeenCalledWith("project", hosted, false, expect.any(Date));
  });
  it("fails closed when access cannot be read", async () => {
    mocks.deployment.mockRejectedValue(new Error("read unavailable"));
    expect(await readFirstCheckSourceReady("project", [own])).toBe(false);
  });
});
