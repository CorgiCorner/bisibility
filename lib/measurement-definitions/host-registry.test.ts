import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { frozenRequest } from "./canonical";
import { definitionSourceFixture } from "./fixtures";
import { hostDefinitionAdapter, hostDefinitionAdapters } from "./host-adapters";
import { assertHostDefinitionAdapter, assertHostDefinitionRequest } from "./host-registry";
import type { DefinitionTransaction } from "./model";

const tx = {} as DefinitionTransaction;
function source() {
  const value = definitionSourceFixture();
  value.policy.config = {
    version: 1,
    definitionVersion: "web-organic-v1",
    forcedAiOverview: false,
    adapters: hostDefinitionAdapters(),
    freshness: {
      configurationRevision: RANK_REPORT_CALENDAR_CONFIGURATION,
      manualTtlMs: null,
      cadenceGraceMs: null,
    },
  };
  return value;
}
afterEach(() => vi.unstubAllEnvs());
describe("actual host observation registry", () => {
  it.each(["dataforseo", "serpapi"])(
    "checks actual version/native policy and exact override for %s",
    async (provider) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "0");
      const value = source(),
        request = frozenRequest(value, provider, 20);
      await expect(
        assertHostDefinitionAdapter(tx, value, provider, request),
      ).resolves.toBeUndefined();
      expect(request).toMatchObject({ stopOnMatch: false, findTargetsIn: null });
      await expect(
        assertHostDefinitionAdapter(tx, value, provider, {
          ...request,
          stopOnMatch: true,
          findTargetsIn: provider === "dataforseo" ? "with_subdomains" : null,
        }),
      ).rejects.toThrow();
      await expect(
        assertHostDefinitionAdapter(tx, value, provider, { ...request, adapterVersion: "stale" }),
      ).rejects.toThrow();
      expect(() =>
        assertHostDefinitionRequest(value.policy.config!, { ...request, depth: 99 as 20 }),
      ).toThrow();
      expect(() =>
        assertHostDefinitionRequest(value.policy.config!, {
          ...request,
          findTargetsIn: "invented",
        }),
      ).toThrow();
    },
  );
  it.each(["dataforseo", "serpapi"] as const)(
    "validates retained v1 %s semantics without weakening v2 validation",
    async (provider) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "0");
      const value = source();
      const current = frozenRequest(value, provider, 20);
      const { compilerVersion: _version, ...fields } = current as typeof current & {
        compilerVersion?: 2;
      };
      const legacy = {
        ...fields,
        stopOnMatch: true,
        findTargetsIn: provider === "dataforseo" ? "with_subdomains" : null,
      };
      await expect(
        assertHostDefinitionAdapter(tx, value, provider, legacy),
      ).resolves.toBeUndefined();
      await expect(
        assertHostDefinitionAdapter(tx, value, provider, { ...legacy, keyword: "forged" }),
      ).rejects.toThrow();
    },
  );
  it("does not register manifest-only production local-sequence", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "0");
    expect(hostDefinitionAdapter("local-sequence")).toBeNull();
    expect(hostDefinitionAdapter("invented")).toBeNull();
  });
  it("binds the actual fake IDs to synthetic versions rather than production extractor versions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
    const value = source(),
      request = frozenRequest(value, "dataforseo", 100);
    expect(request.adapterVersion).toBe("synthetic-serp-observation-v1");
    expect(request.findTargetsIn).toBeNull();
    await expect(
      assertHostDefinitionAdapter(tx, value, "dataforseo", request),
    ).resolves.toBeUndefined();
  });
});
