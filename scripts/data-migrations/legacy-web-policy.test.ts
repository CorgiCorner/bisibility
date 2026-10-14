import { hostDefinitionAdapters } from "@/lib/measurement-definitions/host-adapters";
import { hostDefinitionConfigImplemented } from "@/lib/measurement-definitions/host-registry";
import { persistedPolicySchema } from "@/lib/measurement-definitions/schema";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import { afterEach, expect, it, vi } from "vitest";
import { legacyWebPolicy } from "./20261013000000_legacy_web_policy";

afterEach(() => vi.unstubAllEnvs());
it("converts only to the exact supported native release manifest with unknown freshness", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "0");
  expect(persistedPolicySchema.parse(legacyWebPolicy)).toEqual({
    version: 1,
    definitionVersion: "web-organic-v1",
    forcedAiOverview: false,
    adapters: hostDefinitionAdapters(),
    freshness: {
      configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
      manualTtlMs: null,
      cadenceGraceMs: null,
    },
  });
  expect(hostDefinitionConfigImplemented(legacyWebPolicy)).toBe(true);
});
