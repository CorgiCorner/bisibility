import type { BusinessTransaction } from "@/lib/business-location-store/context";
import { frozenConfiguredScope } from "@/lib/measurement-definitions/canonical";
import { definitionBindingFixture } from "@/lib/measurement-definitions/fixtures";
import { expect, it, vi } from "vitest";
import { retainedRematchSource } from "./rematch-source";

function setup(pack: unknown = { version: 1, identityIssues: 0 }) {
  const binding = definitionBindingFixture(),
    time = new Date("2026-10-10T10:00:00Z");
  const row = {
    id: "original",
    projectId: binding.projectId,
    rankCheckId: binding.owner.rankCheckId,
    definitionBindingId: binding.id,
    neutralExecutionItemId: null,
    rankCheck: { keywordId: binding.keywordId, normalizationVersion: "original-v1" },
    provider: binding.request.providerId,
    surface: "web_serp",
    engine: "google",
    createdAt: time,
    executedAt: time,
    effectiveScope: null,
    configuredScope: frozenConfiguredScope(binding.source.target),
    requestPolicy: {
      depth: binding.request.depth,
      stopOnMatch: binding.request.stopOnMatch,
      findTargetsIn: binding.request.findTargetsIn,
      forcedAiOverview: false,
      evidence: {
        version: 1,
        adapterVersion: binding.request.adapterVersion,
        observedAt: time.toISOString(),
        requestedAt: null,
        targetRevision: binding.targetRevision,
        policyRevision: binding.policyRevision,
        completeThrough: { local_pack: null },
        webLocalPack: pack,
      },
    },
    items: [
      {
        id: "item",
        ordinal: 0,
        resultKind: "local_pack",
        rankGroup: null,
        rankAbsolute: null,
        blockPosition: 1,
        positionInBlock: 2,
        rankScale: "pack_slot",
        promotion: "organic",
        sourcePage: 1,
        sourceBlockId: "original-block",
        sourceOrdinal: 0,
        observedAt: time,
        businessName: "Synthetic",
        domain: "example.test",
        cid: "123456789012345",
        placeId: null,
        rawFragment: null,
      },
    ],
  };
  const tx = {
    observationRun: { findFirst: vi.fn().mockResolvedValue(row) },
    $queryRaw: vi.fn().mockResolvedValue([binding]),
  } as unknown as BusinessTransaction;
  return { tx, row, binding };
}
it("retained versioned zero-anomaly proof survives fragment TTL without inventing current scope", async () => {
  const { tx, binding } = setup();
  expect(
    await retainedRematchSource(
      tx,
      binding.projectId,
      "original",
      new Date("2026-10-12T00:00:00Z"),
    ),
  ).toMatchObject({
    itemIds: ["item"],
    surface: "web_serp",
    sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});
it.each([
  undefined,
  null,
  { version: 1, identityIssues: 1 },
  { version: 2, identityIssues: 0 },
  { version: 1, identityIssues: -1 },
])("missing/conflicting retained anomaly proof blocks rematch after fragment TTL", async (pack) => {
  const { tx, row, binding } = setup(null);
  row.requestPolicy.evidence.webLocalPack = pack;
  await expect(
    retainedRematchSource(tx, binding.projectId, "original", new Date("2026-10-12T00:00:00Z")),
  ).rejects.toThrow("unavailable");
});
it("refuses original time/owner conflicts instead of using current keyword metadata", async () => {
  const { tx, row, binding } = setup();
  row.requestPolicy.evidence.observedAt = "not-a-time";
  await expect(
    retainedRematchSource(tx, binding.projectId, "original", new Date("2026-10-12T00:00:00Z")),
  ).rejects.toThrow();
  expect(tx.$queryRaw).toHaveBeenCalledOnce();
});
