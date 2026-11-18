import type { AssistantConfigView, FundingOptionView } from "@/lib/assistant/wire";
import { expect, test } from "vitest";
import { withAiBillingConnections } from "./provider-billing-connections";

function config(funding: FundingOptionView[], overrides: Partial<AssistantConfigView> = {}) {
  return {
    funding,
    fundingPreference: [],
    creditsEnabled: true,
    ...overrides,
  } as AssistantConfigView;
}
function option(mode: "byok" | "credits", available = true): FundingOptionView {
  return {
    provider: "openai",
    mode,
    available,
    reason: null,
    usage: null,
    credential: mode === "byok" ? { id: "key", last4: "1234", status: "active" } : null,
  };
}
const own = {
  connectionId: "native",
  providerId: "openai",
  label: "OpenAI",
  credentialSource: "own",
  billable: true,
} as const;

test("uses the stored Credits choice without duplicating an existing own key", () => {
  expect(
    withAiBillingConnections(
      [own],
      config([option("byok"), option("credits")], {
        fundingPreference: [{ provider: "openai", mode: "credits" }],
      }),
    ),
  ).toEqual([{ ...own, connectionId: "ai:openai", credentialSource: "hosted" }]);
});
test("keeps active own keys when assistant execution is disabled and preserves other providers", () => {
  const gateway = { ...own, providerId: "vercel_ai_gateway", connectionId: "gateway" };
  expect(withAiBillingConnections([own, gateway], config([option("byok", false)]))).toEqual([
    gateway,
    { ...own, connectionId: "ai:openai" },
  ]);
});
test("excludes unavailable Credits but retains a configured source at its spending limit", () => {
  expect(withAiBillingConnections([], config([option("credits", false)]))).toEqual([]);
  expect(
    withAiBillingConnections(
      [],
      config([{ ...option("credits", false), reason: "limit_exceeded" }]),
    ),
  ).toHaveLength(1);
});
