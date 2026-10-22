import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveProjectLookupTtl } from "./effective-lookup-ttl";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("effective project lookup lifetime", () => {
  it("uses a project override for every lookup kind", () => {
    expect(effectiveProjectLookupTtl(2_592_000, "backlinks")).toBe(2_592_000);
    expect(effectiveProjectLookupTtl(3600, "keyword_metrics")).toBe(3600);
    expect(effectiveProjectLookupTtl(86_400, "ai_visibility")).toBe(86_400);
  });

  it("uses the instance default for the lookup kind when the project setting is unset", () => {
    vi.stubEnv("KEYWORD_RESEARCH_CACHE_TTL_SECONDS", "7200");
    vi.stubEnv("BACKLINKS_CACHE_TTL_SECONDS", "");
    vi.stubEnv("DOMAIN_OVERVIEW_CACHE_TTL_SECONDS", "");
    vi.stubEnv("RANKED_KEYWORDS_CACHE_TTL_SECONDS", "");
    vi.stubEnv("READ_ONLY_DEMO", "");
    vi.stubEnv("DEMO_MODE", "");
    expect(effectiveProjectLookupTtl(null, "keyword_research")).toBe(7200);
    expect(effectiveProjectLookupTtl(undefined, "keyword_metrics")).toBe(7200);
    expect(effectiveProjectLookupTtl(null, "backlinks")).toBe(86_400);
    expect(effectiveProjectLookupTtl(null, "domain_overview")).toBe(43_200);
    expect(effectiveProjectLookupTtl(null, "ranked_keywords")).toBe(43_200);
    expect(effectiveProjectLookupTtl(null, "ai_visibility")).toBe(43_200);
    expect(effectiveProjectLookupTtl(null, "prompt_explorer")).toBe(43_200);
  });
});
