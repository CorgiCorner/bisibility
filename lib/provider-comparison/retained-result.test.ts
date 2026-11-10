import { expect, it } from "vitest";
import { publicComparisonResult } from "./retained-result";

it("never sends stored native fragments or internal check IDs to the client", () => {
  expect(
    publicComparisonResult({
      results: [],
      _capture: { token: "private" },
      _sourceCheckId: "internal",
      _savedCheckRef: "public",
    }),
  ).toEqual({ results: [] });
});

it("projects repaired links without exposing conversion metadata or mutating saved evidence", () => {
  const url = "https://google.com/goto?url=one";
  const original = {
    results: [{ rank: 4, url, domain: "google.com", title: "Original" }],
    position: null,
    _urlRepair: {
      version: 1,
      workflowId: "job",
      runId: "run",
      status: "completed",
      updatedAt: "2026-11-09T10:00:00Z",
      mappings: { [url]: "https://destination.test/page" },
      resolved: 1,
      unresolved: 0,
    },
  };
  const view = publicComparisonResult(original);
  expect(view?.results[0]).toMatchObject({
    rank: 4,
    url: "https://destination.test/page",
    domain: "destination.test",
  });
  expect(view?.position).toBeNull();
  expect(view).not.toHaveProperty("_urlRepair");
  expect(view?.urlRepair).not.toHaveProperty("mappings");
  expect(original.results[0].url).toBe(url);
});
