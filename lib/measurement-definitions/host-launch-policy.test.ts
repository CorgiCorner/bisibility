import type { RunSelectionKeyword } from "@/lib/rank-check/runs/selection";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostDefinitionAdapters } from "./host-adapters";
import { launchPolicyBlock } from "./host-launch-policy";
import type { HostPolicySnapshot } from "./host-policy-contract";

const row = {
  id: "target",
  device: "desktop",
  locationRef: { kind: "city" },
} as RunSelectionKeyword;
afterEach(() => vi.unstubAllEnvs());
describe("first-run quote policy fence", () => {
  it("names missing configuration without fabricating a head or period", () => {
    expect(
      launchPolicyBlock(
        { state: "unconfigured", policyEpoch: "0", config: null },
        "dataforseo",
        [row],
        [100],
      ),
    ).toBe("measurement_policy_unconfigured");
  });
  it("admits an explicit null-freshness policy and validates exact target options", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "0");
    const snapshot: HostPolicySnapshot = {
      state: "ready",
      policyEpoch: "1",
      config: {
        version: 1,
        definitionVersion: "web-organic-v1",
        forcedAiOverview: false,
        adapters: hostDefinitionAdapters(),
        freshness: {
          configurationRevision: "host-own-calendar-v1",
          manualTtlMs: null,
          cadenceGraceMs: null,
        },
      },
    };
    expect(launchPolicyBlock(snapshot, "dataforseo", [row], [100])).toBeNull();
    expect(launchPolicyBlock(snapshot, "dataforseo", [row], [99])).toBe(
      "measurement_policy_unsupported",
    );
    expect(
      launchPolicyBlock(
        snapshot,
        "dataforseo",
        [{ ...row, device: "invented" as "desktop" }],
        [100],
      ),
    ).toBe("measurement_policy_unsupported");
    expect(
      launchPolicyBlock(
        snapshot,
        "dataforseo",
        [{ ...row, locationRef: null as unknown as RunSelectionKeyword["locationRef"] }],
        [100],
      ),
    ).toBe("measurement_policy_unsupported");
  });
});
