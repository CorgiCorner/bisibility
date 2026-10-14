import { serpApiObservationRun } from "@/lib/providers/serp/observation-extract-serpapi";
import { expect, it, vi } from "vitest";
import { projectLocalCheck } from "./projection";
import { localCheck, localDecision, localFixtureScope } from "./test-fixtures";

vi.mock("server-only", () => ({}));
function native(identityIssues: number | null) {
  const check = localCheck("a", 2);
  if (!check.observationRun) throw new Error("Expected local fixture");
  check.provider = "dataforseo";
  check.observationRun.provider = "dataforseo";
  check.observationRun.requestPolicy = {
    evidence: {
      version: 1,
      adapterVersion: "dataforseo-observation-v1",
      targetRevision: "target-1",
      policyRevision: "policy-1",
      observedAt: "2026-10-12T11:00:00.000Z",
      requestedAt: null,
      completeThrough: { local_pack: null },
      ...(identityIssues === null
        ? {}
        : {
            webLocalPack: {
              version: 1,
              identityIssues,
              scopeSource: "sent_request",
              completeness: "unknown",
            },
          }),
    },
  };
  const decision = localDecision(check);
  return projectLocalCheck(check, "a", new Map([[decision.itemId, decision]]), localFixtureScope);
}
it("admits an actual positive slot without manufacturing complete absence", () => {
  const projected = native(0);
  expect(projected.target.position).toBe(2);
  expect(projected.target.completeThrough).toBeNull();
  expect(projected.presence.position).toBe(1);
});
it("keeps old provider metadata and malformed identity collections unknown", () => {
  expect(native(null).reasons).toContain("local_pack_adapter_proof_unavailable");
  const bad = native(1);
  expect(bad.reasons).toContain("local_pack_identity_unavailable");
  expect(bad.target.position).toBeNull();
  expect(bad.target.effectiveScope).toBeNull();
});

function projectedSerpPage(parameters: Record<string, unknown>, start = 0) {
  const check = localCheck("a", 2),
    run = check.observationRun;
  if (!run) throw new Error("Expected retained fixture");
  const scope = { location: "geo-1", language: "en", device: "desktop" };
  const observation = serpApiObservationRun({
    configuredScope: scope,
    executedAt: new Date("2026-10-12T11:01:00Z"),
    requestPolicy: { depth: 20, stopOnMatch: false, forcedAiOverview: false },
    completeness: "complete",
    sentPages: [{ engine: "google", start, scope, wireLocation: "geo-1" }],
    pages: [
      {
        search_parameters: parameters,
        search_metadata: { processed_at: "2026-10-12T11:00:00Z" },
        local_results: { places: [{ position: 2, place_id: "123", title: "Synthetic branch" }] },
      },
    ],
  });
  const item = observation.items[0];
  if (!item || !observation.requestPolicy.evidence) throw new Error("Expected parsed evidence");
  run.provider = "serpapi";
  check.provider = "serpapi";
  run.effectiveScope = observation.effectiveScope ?? null;
  // Model the existing JSON storage boundary; no helper qualification or matching is mocked.
  run.requestPolicy = JSON.parse(
    JSON.stringify({
      ...observation.requestPolicy,
      evidence: {
        ...observation.requestPolicy.evidence,
        targetRevision: "target-1",
        policyRevision: "policy-1",
      },
    }),
  );
  run.items[0] = {
    ...run.items[0],
    rankScale: item.rankScale ?? null,
    promotion: item.promotion ?? null,
    sourcePage: item.sourcePage ?? null,
    sourceBlockId: item.sourceBlockId ?? null,
    sourceOrdinal: item.sourceOrdinal ?? null,
    observedAt: item.observedAt ?? null,
    positionInBlock: item.positionInBlock ?? null,
    cid: item.cid ?? null,
    placeId: item.placeId ?? null,
  };
  const decision = localDecision(check);
  return {
    observation,
    result: projectLocalCheck(
      check,
      "a",
      new Map([[decision.itemId, decision]]),
      localFixtureScope,
    ),
  };
}
it.each([
  { engine: "google_maps", start: 0 },
  { engine: "google_local", start: 0 },
  { engine: "google", tbm: "lcl", start: 0 },
])("rejects explicit non-web surface even with a complete used-location echo: %j", (conflict) => {
  const { observation, result } = projectedSerpPage({
    ...conflict,
    location_used: "geo-1",
    hl: "en",
    device: "desktop",
  });
  expect(observation.effectiveScope).toBeNull();
  expect(observation.items[0]).toMatchObject({
    promotion: "unknown",
    rankScale: null,
    sourcePage: null,
  });
  expect(observation.requestPolicy.evidence?.webLocalPack?.scopeSource).toBeNull();
  expect(result.target.position).toBeNull();
  expect(result.target.effectiveScope).toBeNull();
});
it("does not relabel a returned first page as the requested second page", () => {
  const { observation, result } = projectedSerpPage(
    { engine: "google", start: 0, location_used: "geo-1", hl: "en", device: "desktop" },
    10,
  );
  expect(observation.items[0].sourcePage).toBeNull();
  expect(observation.effectiveScope).toBeNull();
  expect(observation.requestPolicy.evidence?.webLocalPack?.scopeSource).toBeNull();
  expect(result.target.position).toBeNull();
});
it("uses the actual sent page and scope when response echoes are absent", () => {
  const { observation, result } = projectedSerpPage({});
  expect(observation.items[0]).toMatchObject({
    promotion: "organic",
    rankScale: "pack_slot",
    sourcePage: 1,
    cid: "123",
  });
  expect(observation.requestPolicy.evidence?.webLocalPack?.scopeSource).toBe("sent_request");
  expect(result.target.position).toBe(2);
});
