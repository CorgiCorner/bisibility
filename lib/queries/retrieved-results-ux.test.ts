import { expect, it, vi } from "vitest";
import { retrievedCheckResult } from "./retrieved-results-detail";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/serp/snapshot-extension-view", () => ({
  loadSnapshotExtensionView: vi.fn(async () => undefined),
}));

const check = {
  rankingUrl: null,
  publicId: "check_example",
  checkedAt: new Date("2026-11-04T12:00:00Z"),
  provider: "serpapi",
  position: null,
  requestedDepth: 20,
  organicRanks: null,
  raw: {
    normalization: { outcome: "no_match", version: "v2", anomalies: [] },
    organic_results: [
      { rank: 1, domain: "example.org", url: "https://example.org", title: "Example" },
    ],
  },
};
it("uses a retained deferred overview even when completeness is unknown", async () => {
  const result = await retrievedCheckResult(
    "project",
    {
      ...check,
      observationRun: {
        projectId: "project",
        completeness: "complete",
        configuredScope: { device: "mobile" },
        requestPolicy: { evidence: { completeThrough: { ai_overview: null } } },
        items: [
          { resultKind: "ai_overview", title: null, rawFragment: { page_token: "fixture-token" } },
        ],
      },
    },
    null,
  );
  expect(result).toMatchObject({
    aiOverview: true,
    aiOverviewContentLoaded: false,
    storedData: {
      normalization: check.raw.normalization,
      observationItems: [{ resultKind: "ai_overview", title: null }],
      scope: { configured: { device: "mobile" } },
    },
  });
  expect(JSON.stringify(result)).not.toContain("fixture-token");
});
it("does not claim that missing overview data means provider support is absent", async () => {
  expect(await retrievedCheckResult("project", check, null)).toMatchObject({ aiOverview: null });
});
it("projects retained overview text on the live and queued adapter result shape", async () => {
  const result = await retrievedCheckResult(
    "project",
    {
      ...check,
      provider: "dataforseo",
      observationRun: {
        projectId: "project",
        completeness: "complete",
        items: [{ resultKind: "ai_overview", title: "Stored overview" }],
      },
    },
    null,
  );
  expect(result).toMatchObject({ aiOverview: true, aiOverviewContentLoaded: true });
});
it("exports redirect resolution only for a stored matching URL", async () => {
  const result = await retrievedCheckResult(
    "project",
    {
      ...check,
      raw: {
        ...check.raw,
        organic_results: [
          { rank: 1, domain: "example.org", url: "https://example.org" },
          { rank: 2, domain: "example.com", url: null },
        ],
        redirect_resolutions: [
          {
            originalUrl: "https://example.org/redirect",
            url: "https://example.org",
            status: "resolved",
          },
          { originalUrl: "https://example.org/missing", url: null, status: "unresolved" },
        ],
      },
    },
    null,
  );
  if (result.tier !== "full") throw new Error("Expected full snapshot");
  expect(result.rows[0]).toMatchObject({ resultType: "redirect", resolutionStatus: "resolved" });
  expect(result.rows[1]).toMatchObject({ resultType: "organic", resolutionStatus: null });
});
it("does not expose observation evidence from another project", async () => {
  const result = await retrievedCheckResult(
    "project",
    {
      ...check,
      observationRun: {
        projectId: "other-project",
        completeness: "complete",
        configuredScope: { location: "foreign" },
        items: [{ resultKind: "ai_overview", title: "foreign overview" }],
      },
    },
    null,
  );
  expect(result).toMatchObject({
    aiOverview: null,
    storedData: { observationItems: [], scope: null },
  });
  expect(JSON.stringify(result)).not.toContain("foreign");
});
