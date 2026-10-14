import { describe, expect, it } from "vitest";
import { localCacheKey, readLocalEvidenceCache } from "./cache";
import {
  localCapabilityFixture,
  localFixtureNow,
  localQuoteFixture,
  localSelectionFixture,
} from "./fixtures";
import { logicalProbeCount } from "./probe-count";
import { assertFrozenQuoteSelection, assertLocalQuote, localQuoteHash } from "./quote";
import { executionTargetKey } from "./target-key";

describe("frozen native quote and read-only evidence cache", () => {
  it("binds source versions, expiry, options and complete expected target set", () => {
    const { targets } = localSelectionFixture(3);
    const quote = localQuoteFixture(targets.map(executionTargetKey));
    expect(localQuoteHash(quote)).toBe(
      localQuoteHash({ ...quote, expectedTargetKeys: [...quote.expectedTargetKeys].reverse() }),
    );
    const changes = [
      { providerPriceVersion: "price-v2" },
      { capabilityVersion: "cap-v2" },
      { expiresAt: "2026-10-12T14:00:00.000Z" },
      { effectiveOptions: { depth: "100" } },
      { expectedTargetKeys: quote.expectedTargetKeys.slice(1) },
    ];
    for (const change of changes)
      expect(localQuoteHash({ ...quote, ...change })).not.toBe(localQuoteHash(quote));
    assertLocalQuote({
      quote,
      target: targets[0],
      capability: localCapabilityFixture,
      providerPriceVersion: quote.providerPriceVersion,
      now: localFixtureNow,
    });
    assertFrozenQuoteSelection(quote, [...targets].reverse());
    expect(() => assertFrozenQuoteSelection(quote, targets.slice(1))).toThrow("full frozen");
    expect(() =>
      localQuoteHash({
        ...quote,
        expectedTargetKeys: [quote.expectedTargetKeys[0], quote.expectedTargetKeys[0]],
      }),
    ).toThrow();
  });
  it("keeps enormous exact native amounts and quota units as strings", () => {
    const quote = localQuoteFixture([executionTargetKey(localSelectionFixture(1).targets[0])]);
    const exact = {
      ...quote,
      nativeEstimates: [{ unit: "searches", amount: "900719925474099312345.123456789" }],
    };
    expect(localQuoteHash(exact)).not.toBe(
      localQuoteHash({
        ...exact,
        nativeEstimates: [{ unit: "searches", amount: "900719925474099312345.123456788" }],
      }),
    );
    expect(exact.nativeEstimates[0].amount).toBe("900719925474099312345.123456789");
  });
  it("preserves original observedAt, scope and null legacy time with no paid refresh port", async () => {
    const target = localSelectionFixture(1).targets[0];
    const provenance = {
      connectionId: "connection-a",
      provider: "synthetic",
      adapterVersion: "v1",
      normalizationVersion: "v1",
    };
    const key = localCacheKey(target, provenance);
    const retained = {
      key,
      evidenceId: "observation-a",
      originalObservedAt: "2026-10-12T09:00:00.000Z",
      storedAt: "2026-10-12T10:00:00.000Z",
      expiresAt: "2026-10-12T13:00:00.000Z",
    };
    const input = {
      target,
      provenance,
      now: localFixtureNow,
      cache: {
        async read() {
          return retained;
        },
      },
    };
    expect(await readLocalEvidenceCache(input)).toEqual(retained);
    expect(
      await readLocalEvidenceCache({ ...input, now: new Date("2026-10-12T13:00:00.000Z") }),
    ).toBeNull();
    expect(
      await readLocalEvidenceCache({
        ...input,
        cache: {
          async read() {
            return { ...retained, originalObservedAt: null };
          },
        },
      }),
    ).toMatchObject({ originalObservedAt: null });
    expect(localCacheKey({ ...target, pointRevision: "changed-point" }, provenance)).not.toBe(key);
    expect(localCacheKey(target, { ...provenance, adapterVersion: "v2" })).not.toBe(key);
    await expect(
      readLocalEvidenceCache({ ...input, provenance: { ...provenance, connectionId: "other" } }),
    ).rejects.toThrow("scope mismatch");
  });
  it("counts independent probes without treating the pack from one web SERP as another request", () => {
    const ids = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
    expect(
      logicalProbeCount({
        keywordRevisions: ids(20, "kw"),
        pointRevisions: ids(25, "point"),
        surfaces: ["maps", "local_finder"],
        devices: ["desktop"],
        requiredExecutions: 1,
      }),
    ).toBe(1000n);
    expect(
      logicalProbeCount({
        keywordRevisions: ids(2, "kw"),
        pointRevisions: ids(9, "point"),
        surfaces: ["web_serp"],
        devices: ["desktop"],
        requiredExecutions: 1,
      }),
    ).toBe(18n);
    expect(
      logicalProbeCount({
        keywordRevisions: [],
        pointRevisions: [],
        surfaces: [],
        devices: [],
        requiredExecutions: 0,
      }),
    ).toBe(0n);
  });
});
