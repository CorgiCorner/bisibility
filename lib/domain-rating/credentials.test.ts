import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), hosted: vi.fn(), decrypt: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findUnique: mocks.findUnique } },
}));
vi.mock("./hosted-extension", () => ({ hostedDomainRatingKey: mocks.hosted }));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));

import { resolveDomainRatingCredentials } from "./credentials";

const now = new Date();
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hosted.mockResolvedValue("managed-fixture");
});
describe("rating credential selection", () => {
  it("prefers the user's key", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "c1",
      enabled: true,
      status: "connected",
      credentialsEncrypted: "encrypted",
    });
    mocks.decrypt.mockReturnValue({ apiKey: "own-fixture" });
    expect(await resolveDomainRatingCredentials("p1", now)).toEqual({
      key: "own-fixture",
      source: "own",
      connectionId: "c1",
    });
    expect(mocks.hosted).not.toHaveBeenCalled();
  });
  it("never falls back from a paused own connection", async () => {
    mocks.findUnique.mockResolvedValue({ enabled: false, credentialsEncrypted: "encrypted" });
    expect(await resolveDomainRatingCredentials("p1", now)).toBeNull();
    expect(mocks.hosted).not.toHaveBeenCalled();
  });
  it("uses only the project-scoped managed resolver when no own key exists", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await resolveDomainRatingCredentials("p1", now)).toEqual({
      key: "managed-fixture",
      source: "hosted",
      connectionId: null,
    });
    expect(mocks.hosted).toHaveBeenCalledWith("p1", now);
  });
});
