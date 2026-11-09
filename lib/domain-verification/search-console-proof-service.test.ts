import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  connection: vi.fn(),
  registry: vi.fn(),
  update: vi.fn(),
  decrypt: vi.fn(),
  refresh: vi.fn(),
  sites: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.project },
    providerConnection: { findUnique: mocks.connection },
    searchInsightsPropertyRegistry: { findUnique: mocks.registry, updateMany: mocks.update },
  },
}));
vi.mock("@/lib/providers/analytics/google-client", () => ({
  listGoogleSites: mocks.sites,
  refreshGoogleAccessToken: mocks.refresh,
}));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));

import { checkSearchConsoleProof } from "./search-console-proof";

describe("connected property proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue({ domain: "www.example.com" });
    mocks.connection.mockResolvedValue({
      enabled: true,
      status: "connected",
      credentialsEncrypted: "sealed",
    });
    mocks.decrypt.mockReturnValue({ apiKey: "secret", login: "https://www.example.com/" });
    mocks.registry.mockResolvedValue({ status: "active", propertyKey: "https://www.example.com/" });
    mocks.refresh.mockResolvedValue("access");
    mocks.sites.mockResolvedValue([
      { siteUrl: "https://www.example.com/", permissionLevel: "siteFullUser" },
    ]);
    mocks.update.mockResolvedValue({ count: 1 });
  });
  it("accepts live full-user proof for exactly the connected host", async () => {
    await expect(checkSearchConsoleProof("project", "example.com")).resolves.toEqual({
      result: "verified",
      scope: "host:www.example.com",
    });
  });
  it("treats unreadable connection credentials as unavailable", async () => {
    mocks.decrypt.mockImplementation(() => {
      throw new Error("unreadable");
    });
    await expect(checkSearchConsoleProof("project", "example.com")).resolves.toEqual({
      result: "unavailable",
      scope: null,
    });
    expect(mocks.sites).not.toHaveBeenCalled();
  });
  it("rejects an archived property without a provider call", async () => {
    mocks.registry.mockResolvedValue({ status: "archived" });
    await expect(checkSearchConsoleProof("project", "example.com")).resolves.toMatchObject({
      result: "missing",
    });
    expect(mocks.sites).not.toHaveBeenCalled();
  });
  it("rejects a changed connection after the live property read", async () => {
    mocks.connection
      .mockResolvedValueOnce({ enabled: true, status: "connected", credentialsEncrypted: "sealed" })
      .mockResolvedValueOnce({
        enabled: false,
        status: "connected",
        credentialsEncrypted: "sealed",
      });
    await expect(checkSearchConsoleProof("project", "example.com")).resolves.toMatchObject({
      result: "missing",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("never logs an upstream error or exposes tokens", async () => {
    const log = vi.spyOn(console, "error");
    mocks.sites.mockRejectedValue(new Error("secret access"));
    await expect(checkSearchConsoleProof("project", "example.com")).resolves.toEqual({
      result: "unavailable",
      scope: null,
    });
    expect(log).not.toHaveBeenCalled();
  });
});
