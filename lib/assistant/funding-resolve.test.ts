import { expect, test } from "vitest";
import { fundingServes, resolveAssistantFunding } from "./funding-resolve";
import { type FundingOptionView, fundingPreferenceRequestSchema, turnRequestSchema } from "./wire";

function option(
  patch: Partial<FundingOptionView> & Pick<FundingOptionView, "mode">,
): FundingOptionView {
  return {
    provider: "openai",
    available: true,
    reason: null,
    usage: null,
    credential: null,
    ...patch,
  };
}

const byok = option({
  mode: "byok",
  credential: { id: "key", last4: "abcd", status: "active" },
});
const credits = option({
  mode: "credits",
  usage: { usedCents: "0.0000", limitCents: "1.0000" },
});

test("defaults to an active own key, otherwise credits, and keeps a stored choice", () => {
  const base = { provider: "openai" as const, options: [byok, credits], creditsEnabled: true };
  expect(resolveAssistantFunding({ ...base, stored: null })).toEqual({
    mode: "byok",
    provider: "openai",
  });
  expect(resolveAssistantFunding({ ...base, stored: "credits" })).toEqual({
    mode: "credits",
    provider: "openai",
  });
  expect(
    resolveAssistantFunding({
      ...base,
      stored: null,
      options: [option({ mode: "byok", reason: "byok_missing", available: false }), credits],
    }),
  ).toEqual({ mode: "credits", provider: "openai" });
  expect(resolveAssistantFunding({ ...base, stored: "credits", creditsEnabled: false })).toEqual({
    mode: "byok",
    provider: "openai",
  });
});

test("a reached AI limit does not serve, and an open cap still does", () => {
  expect(
    fundingServes(
      option({
        mode: "credits",
        usage: { usedCents: "1.0000", limitCents: "1.0000" },
      }),
    ),
  ).toBe(false);
  expect(
    fundingServes(option({ mode: "credits", usage: { usedCents: "1.0000", limitCents: null } })),
  ).toBe(true);
  // Open holds count: admission refuses them against the same limit.
  const held = { usedCents: "0.6000", limitCents: "1.0000", heldCents: "0.4000" };
  expect(fundingServes(option({ mode: "credits", usage: held }))).toBe(false);
  expect(fundingServes(option({ mode: "byok", available: false, reason: "byok_missing" }))).toBe(
    false,
  );
});

test("a funding preference is stored per provider", () => {
  expect(
    fundingPreferenceRequestSchema.safeParse({
      project: "prj_test",
      provider: "openai",
      mode: "credits",
    }).success,
  ).toBe(true);
  expect(
    fundingPreferenceRequestSchema.safeParse({ project: "prj_test", mode: "byok" }).success,
  ).toBe(false);
});

test("a turn request rejects a client funding choice", () => {
  expect(
    turnRequestSchema.safeParse({
      project: "prj_test",
      conversationId: null,
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      text: "Hello",
      modelId: "model",
      funding: { mode: "byok", provider: "openai" },
    }).success,
  ).toBe(false);
});
