import { describe, expect, it } from "vitest";
import { MAX_RESEARCH_TABS, mergeResearchTabs, researchTabIdentity } from "./research-tab-identity";
import type { ResearchTab } from "./research-workspace-model";

const scope = {
  countryCode: "US",
  countryName: "United States",
  languageCode: "en",
  languageLabel: "English",
  providerLocationCode: 2840,
  researchAvailable: true,
};
function tab(mode: ResearchTab["mode"], extra: Partial<ResearchTab> = {}): ResearchTab {
  return {
    id: mode,
    seed: "rank tracker",
    mode,
    scope,
    includeClickstream: false,
    requestedLimit: 100,
    connectionId: "conn_a00000000000000000000000",
    outcome: { ok: false, reason: "lookup_failed", charged: null },
    ...extra,
  };
}
describe("research result variants", () => {
  it("retains results when the same keyword is researched in another mode", () => {
    const auto = tab("auto"),
      ideas = tab("ideas");
    expect(mergeResearchTabs([auto], [ideas])).toEqual([ideas, auto]);
    const refreshed = tab("auto", { id: "refreshed" });
    expect(mergeResearchTabs([ideas, auto], [refreshed])).toEqual([refreshed, ideas]);
  });
  it("separates provider, country/language, result limit and clickstream variants", () => {
    const base = tab("auto");
    const variants = [
      base,
      tab("auto", { connectionId: "conn_b00000000000000000000000" }),
      tab("auto", { requestedLimit: 300 }),
      tab("auto", { includeClickstream: true }),
      tab("auto", { scope: { ...scope, countryCode: "PL", languageCode: "pl" } }),
    ];
    expect(new Set(variants.map(researchTabIdentity)).size).toBe(5);
    expect(mergeResearchTabs(variants.slice(1), [base])).toHaveLength(5);
    expect(researchTabIdentity(tab("auto", { seed: " Rank   Tracker " }))).toBe(
      researchTabIdentity(base),
    );
  });
});

it("deduplicates normalized identities and retains at most twenty newest variants", () => {
  const first = tab("auto", { id: "first", seed: "rank" });
  const duplicate = tab("auto", { id: "duplicate", seed: " Rank " });
  const current = Array.from({ length: 25 }, (_, index) =>
    tab("auto", { id: String(index), seed: `seed ${index}` }),
  );
  const merged = mergeResearchTabs(current, [first, duplicate]);
  expect(merged).toHaveLength(MAX_RESEARCH_TABS);
  expect(merged[0]).toBe(first);
  expect(merged).not.toContain(duplicate);
  expect(merged.at(-1)?.seed).toBe("seed 18");
});
