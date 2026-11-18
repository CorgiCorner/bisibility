import { expect, test } from "vitest";
import { createModelPaymentQuote, modelContentHash } from "./payment";
import { paymentContext } from "./payment.test-support";
import { unavailableModelValuation } from "./preview";

test.each(["workspaceId", "allowedProviders", "temperature", "maxOutputTokens", "search"] as const)(
  "real quote hash covers the entire %s setting",
  (setting) => {
    const a = paymentContext();
    if (setting === "workspaceId") {
      a.input.columns[0].providerId = "anthropic";
    }
    if (setting === "allowedProviders") {
      a.input.columns[0].providerId = "vercel_ai_gateway";
    }
    a.columns[0].binding.column = structuredClone(a.input.columns[0]);
    const before = createModelPaymentQuote(a);
    const b = structuredClone(a);
    const changes = {
      workspaceId: "wrkspc_Synthetic",
      allowedProviders: ["openai"],
      temperature: 0.25,
      maxOutputTokens: 256,
      search: { mode: "openrouter_web_exa", maxCalls: 1 },
    };
    Object.assign(b.input.columns[0].settings, { [setting]: changes[setting] });
    b.columns[0].binding.column = structuredClone(b.input.columns[0]);
    if (setting === "search") b.columns[0].binding.policy.billableDimensions.push("searchCalls");
    const after = createModelPaymentQuote(b);
    expect(after.configHash).not.toBe(before.configHash);
    expect(modelContentHash(b.input)).not.toBe(modelContentHash(a.input));
    expect(createModelPaymentQuote(a).configHash).toBe(before.configHash);
  },
);

test("unknown prices reserve no advisory money at any output or search limit", () => {
  const column = structuredClone(paymentContext().input.columns[0]);
  column.settings.maxOutputTokens = 16;
  const short = unavailableModelValuation(column);
  column.settings.maxOutputTokens = 4096;
  const long = unavailableModelValuation(column);
  expect(long.advisory.cents).toBe("0");
  column.settings.search = { mode: "openrouter_web_exa", maxCalls: 1 };
  const one = unavailableModelValuation(column);
  column.settings.search.maxCalls = 10;
  const ten = unavailableModelValuation(column);
  expect(ten.advisory.cents).toBe("0");
  delete column.settings.search.maxCalls;
  expect(unavailableModelValuation(column).advisory.cents).toBe(ten.advisory.cents);
  for (const value of [short, long, one, ten]) {
    expect(value.advisory).toEqual({ cents: "0", basis: "price_unknown" });
    expect(value.forecast).toMatchObject({ amount: null, certainty: "unknown", basis: "unknown" });
    expect(value.rateCard).toBeNull();
  }
});
