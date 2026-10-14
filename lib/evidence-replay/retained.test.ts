import { frozenConfiguredScope } from "@/lib/measurement-definitions/canonical";
import { definitionBindingFixture } from "@/lib/measurement-definitions/fixtures";
import { expect, it } from "vitest";
import { retainedOrganicReplay } from "./retained";
import { source } from "./test-fixture";

function retained() {
  const binding = definitionBindingFixture();
  const row = source(null, {
    checkId: binding.owner.rankCheckId,
    keywordId: binding.keywordId,
    provider: binding.request.providerId,
  });
  const observation = {
    id: "retained-run",
    projectId: binding.projectId,
    rankCheckId: row.checkId,
    provider: row.provider,
    surface: "web_serp",
    engine: "google",
    configuredScope: frozenConfiguredScope(binding.source.target),
    createdAt: "2026-10-10T12:03:04.123Z",
    binding: { ...binding, capturedAt: binding.capturedAt.toISOString() },
    requestPolicy: {
      depth: binding.request.depth,
      stopOnMatch: binding.request.stopOnMatch,
      findTargetsIn: binding.request.findTargetsIn,
      forcedAiOverview: false,
      evidence: {
        version: 1,
        adapterVersion: binding.request.adapterVersion,
        targetRevision: binding.targetRevision,
        policyRevision: binding.policyRevision,
        observedAt: "2026-10-10T12:03:04.123Z" as string | null,
        requestedAt: null,
        completeThrough: { organic_result: null },
      },
    },
    items: [
      {
        id: "retained-item",
        ordinal: 0,
        resultKind: "organic_result",
        rankGroup: 7,
        domain: "example.test",
        observedAt: "2026-10-10T12:03:04.123Z",
      },
    ],
  };
  row.observation = observation;
  return { row, binding, observation };
}
it("reuses normalized original facts only through their actual winning binding", () => {
  const { row, binding } = retained();
  expect(retainedOrganicReplay(row, binding.projectId)).toEqual({
    facts: [{ domain: "example.test", position: 7 }],
    observedAt: "2026-10-10T12:03:04.123Z",
  });
  expect(retainedOrganicReplay(row, "foreign-project")).toBeNull();
});
it.each(["owner", "provider", "scope", "depth", "revision", "duplicate", "time"])(
  "refuses altered original %s proof or leaves missing time unknown",
  (kind) => {
    const { row, binding, observation } = retained();
    if (kind === "owner")
      observation.binding.owner = { ...observation.binding.owner, rankCheckId: "different" };
    if (kind === "provider") observation.provider = "different";
    if (kind === "scope") observation.configuredScope.device = "mobile";
    if (kind === "depth") observation.requestPolicy.depth = 20;
    if (kind === "revision") observation.requestPolicy.evidence.policyRevision = "different";
    if (kind === "duplicate") observation.items.push({ ...observation.items[0] });
    if (kind === "time") observation.requestPolicy.evidence.observedAt = null;
    const result = retainedOrganicReplay(row, binding.projectId);
    expect(kind === "time" ? result?.observedAt : result).toBeNull();
  },
);
