import {
  readSearchInsightsConnection,
  resolveSearchInsightsConnection,
} from "@/lib/search-insights/sync/credentials";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { providerConnection: { findUnique: vi.fn() } },
  runtimeCredentials: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/traffic/runtime-credentials", () => ({
  trafficRuntimeCredentials: mocks.runtimeCredentials,
}));

const connectionRow = {
  credentialsEncrypted: "encrypted",
  enabled: true,
  id: "conn_1",
  provider: "gsc",
  status: "connected",
};

describe("resolveSearchInsightsConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtimeCredentials.mockReturnValue({
      apiKey: "refresh_token",
      login: "sc-domain:example.com",
    });
  });

  it("reads the single analytics connection for the project and normalizes its property", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connectionRow);

    await expect(resolveSearchInsightsConnection("project_1")).resolves.toEqual({
      connectionId: "conn_1",
      credentials: { apiKey: "refresh_token", login: "sc-domain:example.com" },
      property: "sc-domain:example.com",
    });
    expect(mocks.prisma.providerConnection.findUnique).toHaveBeenCalledWith({
      select: { credentialsEncrypted: true, enabled: true, id: true, provider: true, status: true },
      where: { projectId_provider: { projectId: "project_1", provider: "gsc" } },
    });
  });

  it("builds credentials that persist a rotated refresh token", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connectionRow);

    await resolveSearchInsightsConnection("project_1");

    expect(mocks.runtimeCredentials).toHaveBeenCalledWith(connectionRow);
  });

  it.each([
    ["nothing is connected", null],
    ["the connection is disabled", { ...connectionRow, enabled: false }],
    ["the connection is waiting for a reconnect", { ...connectionRow, status: "needs_reauth" }],
  ])("returns null when %s", async (_label, row) => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(row);

    await expect(resolveSearchInsightsConnection("project_1")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the stored property is unusable", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connectionRow);
    mocks.runtimeCredentials.mockReturnValue({ apiKey: "refresh_token", login: "" });

    await expect(resolveSearchInsightsConnection("project_1")).resolves.toBeNull();
  });
});

describe("readSearchInsightsConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtimeCredentials.mockReturnValue({
      apiKey: "refresh_token",
      login: "sc-domain:example.com",
    });
  });

  it("reports no problem for a connection the module can read", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connectionRow);

    await expect(readSearchInsightsConnection("project_1")).resolves.toMatchObject({
      connection: { connectionId: "conn_1", property: "sc-domain:example.com" },
      problem: null,
    });
  });

  // Only "needs_reauth" is fixed by reconnecting, so the caller can stop telling a user who
  // switched the connection off to reconnect it.
  it.each([
    ["missing", null],
    ["disabled", { ...connectionRow, enabled: false }],
    ["needs_reauth", { ...connectionRow, status: "needs_reauth" }],
  ])("names %s as the reason the module cannot read", async (problem, row) => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(row);

    await expect(readSearchInsightsConnection("project_1")).resolves.toEqual({
      connection: null,
      problem,
    });
  });

  it("names an unreadable stored property rather than asking for a reconnect", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connectionRow);
    mocks.runtimeCredentials.mockReturnValue({ apiKey: "refresh_token", login: "" });

    await expect(readSearchInsightsConnection("project_1")).resolves.toEqual({
      connection: null,
      problem: "unreadable",
    });
  });
});
