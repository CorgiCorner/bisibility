import { previewSourceHash } from "@/lib/rank-check/runs/preview-source-hash";
import { describe, expect, it } from "vitest";
import type { HostPolicySnapshot } from "./host-policy-contract";

const source = { domain: "example.test", stopOnMatch: true, rows: [], depths: [], provider: null };
const policy: HostPolicySnapshot = {
  state: "ready",
  policyEpoch: "1",
  config: {
    version: 1,
    definitionVersion: "web-organic-v1",
    forcedAiOverview: false,
    adapters: [
      {
        providerId: "dataforseo",
        capabilityVersion: "web-serp-v1",
        adapterVersion: "dataforseo-observation-v1",
        nativeFindTargetsIn: "with_subdomains_on_match",
      },
    ],
    freshness: {
      configurationRevision: "host-own-calendar-v1",
      manualTtlMs: null,
      cadenceGraceMs: null,
    },
  },
};
describe("policy and preview source binding", () => {
  it("invalidates cost-preserving freshness changes and A to B to A", () => {
    const a = previewSourceHash({ ...source, measurementPolicy: policy });
    expect(
      previewSourceHash({ ...source, measurementPolicy: { ...policy, policyEpoch: "3" } }),
    ).not.toBe(a);
    expect(
      previewSourceHash({
        ...source,
        measurementPolicy: {
          ...policy,
          config: { ...policy.config!, freshness: { ...policy.config!.freshness, manualTtlMs: 0 } },
        },
      }),
    ).not.toBe(a);
    expect(
      previewSourceHash({ ...source, measurementPolicy: { ...policy, state: "unsupported" } }),
    ).not.toBe(a);
  });
});
