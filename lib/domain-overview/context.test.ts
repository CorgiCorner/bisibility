import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainOverviewProject, domainOverviewSource } from "./context";

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  project: { findFirst: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: mocks.project } }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.getProvider }));

const completeProvider = {
  fetchDomainRankOverview: vi.fn(),
  fetchHistoricalRankOverview: vi.fn(),
  fetchRankedKeywords: vi.fn(),
  fetchRelevantPages: vi.fn(),
  id: "dataforseo",
  label: "DataForSEO",
};
const connection = {
  credentialsEncrypted: "encrypted",
  id: "connection_1",
  provider: "dataforseo",
};
const project = {
  budgetCapCents: 500,
  id: "project_1",
  providerConnections: [connection],
  publicId: "prj_1",
};

describe("domain overview context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.findFirst.mockResolvedValue(project);
    mocks.getProvider.mockReturnValue(completeProvider);
  });

  it("loads an internal or public project ID with the connected SERP chain", async () => {
    await expect(domainOverviewProject("prj_1")).resolves.toEqual(project);
    expect(mocks.project.findFirst).toHaveBeenCalledWith({
      select: {
        budgetCapCents: true,
        id: true,
        providerConnections: {
          orderBy: [{ priority: "asc" }, { provider: "asc" }],
          select: { credentialsEncrypted: true, id: true, provider: true },
          where: { enabled: true, kind: "serp", status: "connected" },
        },
        publicId: true,
      },
      where: { OR: [{ id: "prj_1" }, { publicId: "prj_1" }] },
    });
  });

  it("returns null when the project does not exist", async () => {
    mocks.project.findFirst.mockResolvedValue(null);
    await expect(domainOverviewProject("missing")).resolves.toBeNull();
  });

  it("selects the first connection whose provider has every required capability", () => {
    const incomplete = { ...completeProvider, fetchRelevantPages: undefined, id: "serpapi" };
    const first = { ...connection, id: "connection_0", provider: "serpapi" };
    mocks.getProvider.mockImplementation((id: string) =>
      id === "serpapi" ? incomplete : completeProvider,
    );

    expect(domainOverviewSource({ ...project, providerConnections: [first, connection] })).toEqual({
      connection,
      provider: completeProvider,
    });
  });

  it.each([
    "fetchDomainRankOverview",
    "fetchHistoricalRankOverview",
    "fetchRankedKeywords",
    "fetchRelevantPages",
  ] as const)("rejects a connection missing %s", (capability) => {
    mocks.getProvider.mockReturnValue({ ...completeProvider, [capability]: undefined });
    expect(domainOverviewSource(project)).toBeUndefined();
  });

  it("returns undefined when the project has no provider connection", () => {
    expect(domainOverviewSource({ ...project, providerConnections: [] })).toBeUndefined();
    expect(mocks.getProvider).not.toHaveBeenCalled();
  });

  it("skips an unknown stored provider ID and continues through the connection chain", () => {
    const retired = { ...connection, id: "connection_0", provider: "retired" };
    mocks.getProvider.mockImplementation((id: string) => {
      if (id === "retired") throw new Error("Unknown SERP provider: retired");
      return completeProvider;
    });
    expect(
      domainOverviewSource({ ...project, providerConnections: [retired, connection] }),
    ).toEqual({ connection, provider: completeProvider });
  });

  it("returns no source when every stored provider ID is unknown", () => {
    mocks.getProvider.mockImplementation(() => {
      throw new Error("Unknown SERP provider: retired");
    });
    expect(domainOverviewSource(project)).toBeUndefined();
  });
});
