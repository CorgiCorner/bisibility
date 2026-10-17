import { expect, it } from "vitest";
import { identifyProjectCacheKey } from "./key";

const hash = "a".repeat(64);
it.each([
  [`kr:v2:projectA:c:seed:Poland:pl:related:100:0`, "keyword_research", "seed"],
  [`km:v1:projectA:c:PL:0:${hash}`, "keyword_metrics", null],
  [`rk:v2:projectA:c:example.com:PL:100:0`, "ranked_keywords", "example.com"],
  [
    `bl:v3:projectA:dataforseo:https://example.com/page:page:0:as_is:100`,
    "backlinks",
    "https://example.com/page",
  ],
  [
    `do:v1:projectA:dataforseo:pages:example.com:root:2616:pl:100:0`,
    "domain_overview",
    "example.com",
  ],
  ["do:v1:projectA:dataforseo:overview:example.com:root:2616:pl", "domain_overview", "example.com"],
  [
    "do:v1:projectA:dataforseo:history:example.com:subdomain:2840:en",
    "domain_overview",
    "example.com",
  ],
  [`ai:v2-provider-domain-v1:projectA:c:ai_visibility:${hash}`, "ai_visibility", null],
  [`ai:v2:projectA:c:prompt_explorer:${hash}`, "prompt_explorer", null],
])("classifies %s without admitting locks or another tenant", (key, module, keyword) => {
  expect(identifyProjectCacheKey(key, "projectA")).toMatchObject({ module, keyword });
  expect(identifyProjectCacheKey(key, "projectB")).toBeNull();
  expect(identifyProjectCacheKey(`${key}:lock`, "projectA")).toBeNull();
});
it("never treats catalog, session, paid receipts or arbitrary values as result caches", () => {
  for (const key of [
    "ai-catalog:v1:projectA:c",
    "sessions:projectA:key",
    "paid:receipt:projectA:c",
    "unknown:v1:projectA:c",
  ])
    expect(identifyProjectCacheKey(key, "projectA")).toBeNull();
});

it.each(["zh-TW", "pt-BR"])(
  "recognizes retained domain language %s and excludes its lock",
  (language) => {
    const key = `do:v1:projectA:dataforseo:overview:example.com:root:2840:${language}`;
    expect(identifyProjectCacheKey(key, "projectA")).toMatchObject({
      module: "domain_overview",
      language,
    });
    expect(identifyProjectCacheKey(`${key}:lock`, "projectA")).toBeNull();
  },
);
