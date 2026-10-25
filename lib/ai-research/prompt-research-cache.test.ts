import { effectiveProjectLookupTtl } from "@/lib/provider-lookups/effective-lookup-ttl";
import { expect, it } from "vitest";
import { researchCacheIdentity } from "./cache-identity";
import { researchFundingIdentity } from "./prompt-research-reports";
import { promptResearchSchema } from "./prompt-research-schema";

const input = promptResearchSchema.parse({ keyword: " SEO   Tools ", max_cost_cents: 100 });
const key = (project: string, account = "owner", funding = "payer", patch = {}) =>
  researchCacheIdentity(
    project,
    "connection",
    "prompt_research",
    { ...input, ...patch },
    account,
    funding,
    3600,
  ).key;
it("shares normalized account requests across projects, independent of price, consent and project flags", () => {
  expect(input.keyword).toBe("seo tools");
  expect(key("one")).toBe(key("two"));
  expect(
    key("one", "owner", "payer", {
      max_cost_cents: 0,
      estimate_only: true,
      accepted_payment: { quote_token: "consent" },
    }),
  ).toBe(key("one"));
  expect(key("one", "other")).not.toBe(key("one"));
  expect(key("one", "owner", "other-payer")).not.toBe(key("one"));
  expect(key("one", "owner", "payer", { keyword: "other" })).not.toBe(key("one"));
});
it("uses the project lifetime and isolates funding changes", () => {
  expect(effectiveProjectLookupTtl(60, "prompt_research")).toBe(60);
  expect(
    researchFundingIdentity({ credentialSource: "own", credentialsEncrypted: "fictional" }),
  ).not.toBe(
    researchFundingIdentity({ credentialSource: "hosted", credentialsEncrypted: "fictional" }),
  );
});
