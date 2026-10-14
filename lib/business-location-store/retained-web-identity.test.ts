import { matchBusinessCollection } from "@/lib/business-locations/match";
import { revision } from "@/lib/business-locations/test-fixtures";
import { dataForSeoLocalPack } from "@/lib/providers/serp/dataforseo-local-pack";
import { serpApiLocalPack } from "@/lib/providers/serp/serpapi-local-pack";
import { describe, expect, it, vi } from "vitest";
import { businessDigest } from "./canonical";
import { projectRetainedBusinessObservation } from "./observation-read";

vi.mock("server-only", () => ({}));
function retained(extracted: ReturnType<typeof serpApiLocalPack>, provider = "serpapi") {
  return {
    id: "run",
    projectId: "project",
    provider,
    surface: "web_serp",
    engine: "google",
    rankCheck: { normalizationVersion: "v1" },
    requestPolicy: {
      evidence: {
        version: 1,
        adapterVersion: "v1",
        observedAt: "2026-10-01T10:00:00.000Z",
        webLocalPack: { version: 1, identityIssues: extracted.identityIssues },
      },
    },
    items: extracted.items.map((item, ordinal) => ({
      ...item,
      id: `item-${ordinal}`,
      ordinal,
      rankAbsolute: item.rankAbsolute ?? null,
      blockPosition: item.blockPosition ?? null,
      positionInBlock: item.positionInBlock ?? null,
      rankGroup: item.rankGroup ?? null,
      rawFragment: item.rawFragment ?? null,
      rankScale: item.rankScale ?? null,
      promotion: item.promotion ?? null,
      sourcePage: item.sourcePage ?? null,
      sourceBlockId: item.sourceBlockId ?? null,
      sourceOrdinal: item.sourceOrdinal ?? null,
      observedAt: item.observedAt ?? null,
      businessName: item.businessName ?? null,
      domain: item.domain ?? null,
      cid: item.cid ?? null,
      placeId: item.placeId ?? null,
    })),
  } as Parameters<typeof projectRetainedBusinessObservation>[0];
}
function serp(rows: unknown[]) {
  return serpApiLocalPack([
    { search_parameters: { engine: "google" }, local_results: { places: rows } },
  ]);
}
describe("retained Web identity anomaly projection from actual parsers", () => {
  it("keeps unsafe DFS numeric identifiers unavailable despite a valid sibling identifier", () => {
    const run = retained(
      dataForSeoLocalPack(
        [{ type: "local_pack", cid: Number.MAX_SAFE_INTEGER + 1, place_id: "valid" }],
        [],
      ),
      "dataforseo",
    );
    expect(projectRetainedBusinessObservation(run).items[0].identityIssue).toBe(
      "unsafe_numeric_identifier",
    );
  });
  it("retains contradictory SerpApi CID aliases without poisoning clean siblings", () => {
    const run = retained(
      serp([
        { data_cid: "12", place_id: "13" },
        { data_cid: "14", place_id: "14" },
      ]),
    );
    const items = projectRetainedBusinessObservation(run).items;
    expect(items[0].identityIssue).toBe("contradictory_identifiers");
    expect(items[1]).not.toHaveProperty("identityIssue");
    const target = { ...revision(), projectId: run.projectId };
    expect(
      matchBusinessCollection({
        projectId: run.projectId,
        observationRunId: run.id,
        targets: [target],
        items,
      })[0],
    ).toMatchObject({ status: "unresolved", reason: "contradictory_identifiers" });
    const clean = structuredClone(run);
    clean.requestPolicy = {
      evidence: {
        version: 1,
        adapterVersion: "v1",
        observedAt: "2026-10-01T10:00:00.000Z",
        webLocalPack: { version: 1, identityIssues: 0 },
      },
    };
    expect(businessDigest(items[1])).toBe(
      businessDigest(projectRetainedBusinessObservation(clean).items[1]),
    );
  });
  it("refuses to certify positive issue evidence after raw retention", () => {
    const run = retained(serp([{ data_cid: "12", place_id: "13" }]));
    run.items[0].rawFragment = null;
    expect(projectRetainedBusinessObservation(run).items[0].identityIssue).toBe(
      "invalid_identifier",
    );
  });
  it("keeps zero-issue normalized evidence readable without raw", () => {
    const run = retained(serp([{ data_cid: "12", place_id: "12" }]));
    run.items[0].rawFragment = null;
    expect(projectRetainedBusinessObservation(run).items[0]).not.toHaveProperty("identityIssue");
  });
  it("isolates inconsistent positive evidence to local-pack rows and preserves organic evidence", () => {
    const run = retained(
      serp([
        { data_cid: "12", place_id: "13" },
        { data_cid: "14", place_id: "14" },
      ]),
    );
    run.items[1].resultKind = "organic_result";
    run.items[0].rawFragment = null;
    const items = projectRetainedBusinessObservation(run).items;
    expect(items[0].identityIssue).toBe("invalid_identifier");
    expect(items[1]).not.toHaveProperty("identityIssue");
  });
  it("keeps legacy raw-free evidence but does not lose explicit original raw anomalies", () => {
    const run = retained(
      serp([
        { data_cid: "12", place_id: "13" },
        { data_cid: "14", place_id: "14" },
      ]),
    );
    run.requestPolicy = {
      evidence: { version: 1, adapterVersion: "v1", observedAt: "2026-10-01T10:00:00.000Z" },
    };
    run.items[1].rawFragment = null;
    const items = projectRetainedBusinessObservation(run).items;
    expect(items[0].identityIssue).toBe("contradictory_identifiers");
    expect(items[1]).not.toHaveProperty("identityIssue");
  });
  it("does not trust malformed or future aggregate proofs as a clean identity", () => {
    for (const webLocalPack of [
      { version: 1, identityIssues: -1 },
      { version: 1, identityIssues: "0" },
      { version: 2, identityIssues: 0 },
    ]) {
      const run = retained(serp([{ data_cid: "12", place_id: "12" }]));
      run.requestPolicy = {
        evidence: {
          version: 1,
          adapterVersion: "v1",
          observedAt: "2026-10-01T10:00:00.000Z",
          webLocalPack,
        },
      };
      expect(projectRetainedBusinessObservation(run).items[0].identityIssue).toBe(
        "invalid_identifier",
      );
    }
  });
  it("never invents original observation time while resolving identity evidence", () => {
    const run = retained(serp([{ data_cid: "12", place_id: "13" }]));
    run.requestPolicy = { evidence: { version: 1, adapterVersion: "v1" } };
    expect(() => projectRetainedBusinessObservation(run)).toThrow();
  });
});
