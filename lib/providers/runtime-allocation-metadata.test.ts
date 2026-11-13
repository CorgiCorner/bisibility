import { describe, expect, it } from "vitest";
import {
  providerAllocationMetadata as historicalAllocation,
  PROVIDER_ALLOCATION_METADATA as historicalMetadata,
} from "./allocation-metadata";
import { providerAllocationMetadata } from "./runtime-allocation-metadata";

describe("current provider allocation metadata", () => {
  it("classifies free domain rating without changing historical migration inputs", () => {
    expect(providerAllocationMetadata("ahrefs")).toEqual({ kind: "non_billable" });
    expect(historicalAllocation("ahrefs")).toBeNull();
    expect(providerAllocationMetadata("pagespeed")).toEqual({ kind: "non_billable" });
    expect(historicalAllocation("pagespeed")).toBeNull();
    for (const [provider, metadata] of Object.entries(historicalMetadata))
      expect(providerAllocationMetadata(provider)).toBe(metadata);
  });
  it.each([null, undefined, "unknown", "constructor", "toString"])(
    "rejects unknown provider %s",
    (provider) => {
      expect(providerAllocationMetadata(provider)).toBeNull();
    },
  );
});
