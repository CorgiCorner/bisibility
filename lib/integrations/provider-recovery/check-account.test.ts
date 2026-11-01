import { makePublicId } from "@/lib/db/public-id";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  probe: vi.fn(),
  decrypt: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./check-claim", () => ({ claimAccountCheck: mocks.claim }));
vi.mock("./check-finish", () => ({ finishAccountCheck: mocks.finish }));
vi.mock("./probe", () => ({ runAccountProbe: mocks.probe }));
vi.mock("./read", () => ({ readConnectionRecovery: mocks.read }));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));

import { checkRecoveryAccount } from "./check-account";

const input = {
  projectId: "project",
  projectPublicId: "prj_public",
  connectionPublicId: "conn_public",
  actorId: "owner",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ paused: true });
});
afterEach(() => vi.unstubAllEnvs());
it("demo refuses a probe before credentials, network or state writes", async () => {
  vi.stubEnv("READ_ONLY_DEMO", "1");
  vi.stubEnv("DEMO_USER_ID", makePublicId("usr"));
  vi.stubEnv("DEMO_PROJECT_ID", makePublicId("prj"));
  await expect(checkRecoveryAccount(input)).rejects.toThrow("unavailable in demo");
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("returns progress without a second provider call when a lease is held", async () => {
  mocks.claim.mockResolvedValue({ status: "checking", original: { id: "connection" } });
  expect(await checkRecoveryAccount(input)).toMatchObject({
    accountState: "checking",
    view: { paused: true },
  });
  expect(mocks.probe).not.toHaveBeenCalled();
});
it("shares the claimed adapter and finishes without exposing failures", async () => {
  const claim = {
    status: "claimed",
    adapter: {},
    original: { id: "connection", provider: "dataforseo", credentialsEncrypted: "fixture" },
  };
  mocks.claim.mockResolvedValue(claim);
  mocks.decrypt.mockReturnValue({ login: "test" });
  mocks.probe.mockResolvedValue({ fact: { kind: "not_verified", scope: { kind: "account" } } });
  mocks.finish.mockResolvedValue("unknown");
  expect(await checkRecoveryAccount(input)).toMatchObject({ accountState: "unknown" });
  expect(mocks.finish).toHaveBeenCalledWith(
    input,
    claim,
    expect.objectContaining({ fact: expect.any(Object) }),
  );
});
it("does not probe after persistence fails", async () => {
  mocks.claim.mockRejectedValue(new Error("database unavailable"));
  await expect(checkRecoveryAccount(input)).rejects.toThrow("database unavailable");
  expect(mocks.probe).not.toHaveBeenCalled();
});
