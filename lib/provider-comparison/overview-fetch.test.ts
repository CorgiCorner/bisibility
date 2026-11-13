import { beforeEach, describe, expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";

const m = vi.hoisted(() => ({ transaction: vi.fn(), access: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("./access", () => ({ assertComparisonAccess: m.access }));
vi.mock("./playground-service", () => ({ previewPlaygroundComparison: m.preview }));
vi.mock("./read", () => ({ comparisonRunView: (row: { id: string }) => ({ id: row.id }) }));
vi.mock("./model", async (original) => {
  const actual = await original<typeof import("./model")>();
  // Saved-overview rows carry a ready snapshot; source rows keep the real parser.
  return {
    ...actual,
    parseComparisonSnapshot: (value: { overviewRow?: object }) =>
      value.overviewRow ?? actual.parseComparisonSnapshot(value),
  };
});

import { previewOverviewFetch, readSavedOverviewFetch } from "./overview-fetch";

const input = {
  projectId: "project",
  actorId: "actor",
  target: { kind: "check" as const, checkId: "check_abcdefgh" },
};
const location = { hl: "en", primaryGeoName: "United States" };
const keyword = {
  text: "Coffee",
  device: "desktop",
  locationId: "location",
  locationRef: location,
};
function check() {
  return {
    keyword,
    raw: { snapshotContinuation: { keyword: "Coffee", device: "desktop", location } },
  };
}
let tx: {
  rankCheck: { findFirst: ReturnType<typeof vi.fn> };
  providerComparisonSide: { findFirst: ReturnType<typeof vi.fn> };
  providerComparisonRun: { findMany: ReturnType<typeof vi.fn> };
};
beforeEach(() => {
  vi.resetAllMocks();
  tx = {
    rankCheck: { findFirst: vi.fn().mockResolvedValue(check()) },
    providerComparisonSide: { findFirst: vi.fn().mockResolvedValue(null) },
    providerComparisonRun: { findMany: vi.fn().mockResolvedValue([]) },
  };
  m.transaction.mockImplementation((fn) => fn(tx));
});
describe("overview source authorization and scope", () => {
  it("checks write access and quotes only the original check's exact active search", async () => {
    await previewOverviewFetch(input);
    expect(m.access).toHaveBeenCalledWith(tx, "project", "actor", true);
    expect(tx.rankCheck.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicId: "check_abcdefgh",
          provider: "serpapi",
          keyword: { projectId: "project", archivedAt: null },
        },
      }),
    );
    expect(m.preview).toHaveBeenCalledWith({
      projectId: "project",
      actorId: "actor",
      search: {
        query: "Coffee",
        device: "desktop",
        locationId: "location",
        aiOverview: true,
        depth: 10,
        providers: ["serpapi"],
      },
    });
  });
  it("never quotes or reads a source without write access", async () => {
    m.access.mockRejectedValue(new Error("Forbidden"));
    await expect(previewOverviewFetch(input)).rejects.toThrow("Forbidden");
    expect(tx.rankCheck.findFirst).not.toHaveBeenCalled();
    expect(m.preview).not.toHaveBeenCalled();
  });
  it.each(["missing", "query", "device", "language", "location"])(
    "rejects %s source evidence before quoting",
    async (change) => {
      const value = check();
      if (change === "missing") tx.rankCheck.findFirst.mockResolvedValue(null);
      else {
        const captured = value.raw.snapshotContinuation;
        if (change === "query") captured.keyword = "Other";
        if (change === "device") captured.device = "mobile";
        if (change === "language") captured.location = { ...location, hl: "pl" };
        if (change === "location") captured.location = { ...location, primaryGeoName: "Poland" };
        tx.rankCheck.findFirst.mockResolvedValue(value);
      }
      await expect(previewOverviewFetch(input)).rejects.toThrow();
      expect(m.preview).not.toHaveBeenCalled();
    },
  );
  it("uses the frozen search from a project-scoped completed comparison", async () => {
    tx.providerComparisonSide.findFirst.mockResolvedValue({
      run: { snapshot: comparisonFixture() },
    });
    await previewOverviewFetch({
      ...input,
      target: { kind: "comparison", provider: "serpapi", runId: "run" },
    });
    expect(tx.providerComparisonSide.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runId: "run", projectId: "project", provider: "serpapi", status: "completed" },
      }),
    );
    expect(m.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({
          query: "Example service",
          locationId: "location",
          depth: 10,
        }),
      }),
    );
  });
  it("rejects other providers before source lookup", async () => {
    await expect(
      previewOverviewFetch({
        ...input,
        target: { kind: "comparison", provider: "dataforseo", runId: "run" },
      }),
    ).rejects.toThrow();
    expect(tx.providerComparisonSide.findFirst).not.toHaveBeenCalled();
    expect(m.preview).not.toHaveBeenCalled();
  });
});
describe("saved overview reuse", () => {
  const search = { text: "Coffee", device: "desktop", locationId: "location" };
  const row = (id: string, snapshot: object, status = "completed") => ({
    id,
    snapshot: { overviewRow: snapshot },
    sides: [{ provider: "serpapi", status, result: status === "completed" ? {} : null }],
  });
  it("returns the newest completed overview for the exact source search with read access", async () => {
    tx.providerComparisonRun.findMany.mockResolvedValue([
      row("plain", { ...search }),
      row("other-query", { ...search, aiOverview: true, text: "Tea" }),
      row("other-device", { ...search, aiOverview: true, device: "mobile" }),
      row("running", { ...search, aiOverview: true }, "queued"),
      row("match", { ...search, aiOverview: true }),
      row("older", { ...search, aiOverview: true }),
    ]);
    await expect(readSavedOverviewFetch(input)).resolves.toEqual({ id: "match" });
    expect(m.access).toHaveBeenCalledWith(tx, "project", "actor", false);
    expect(tx.providerComparisonRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "project",
          keywordId: null,
          sides: { some: { provider: "serpapi", status: "completed" } },
        }),
      }),
    );
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("returns nothing when no overview was fetched for that search", async () => {
    tx.providerComparisonRun.findMany.mockResolvedValue([row("plain", { ...search })]);
    await expect(readSavedOverviewFetch(input)).resolves.toBeNull();
  });
  it("never reads saved runs without project access", async () => {
    m.access.mockRejectedValue(new Error("Forbidden"));
    await expect(readSavedOverviewFetch(input)).rejects.toThrow("Forbidden");
    expect(tx.providerComparisonRun.findMany).not.toHaveBeenCalled();
  });
});
