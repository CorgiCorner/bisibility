import { agentReportSchema } from "@/lib/agent-reports/model";
import { describe, expect, it } from "vitest";
import { capabilities } from "./catalog-fixtures.test-support";
import { modelAdmissionBound, promptCost, visibilityCost } from "./cost";
import { citedDomain, observedRow, promptRow } from "./normalize";
import { promptSchema, visibilitySchema } from "./schema";

const target = { brand: "Acme", domain: "acme.com" };
describe("AI evidence contracts", () => {
  it("preserves provider prompts and separates brand mentions from domain citations", () => {
    const row = observedRow(
      {
        question: "best tools",
        answer: "Acme helps",
        model_name: "google_ai_overview",
        date: "2026-10-01",
        sources: [{ url: "https://docs.acme.com/page", title: "Docs" }],
      },
      target,
    );
    expect(row).toMatchObject({
      prompt: "best tools",
      brandMentioned: true,
      domainCited: true,
      observedAt: "2026-10-01",
    });
  });
  it("counts a target citation beyond the display sample and prioritizes it", () => {
    const sources = Array.from({ length: 8 }, (_, index) => ({
      url: index === 6 ? "https://acme.com/target" : `https://other${index}.example`,
    }));
    const row = observedRow(
      { question: "q", answer: "answer", model_name: "chat_gpt", sources },
      target,
    );
    expect(row.domainCited).toBe(true);
    expect(row.citations[0].targetDomain).toBe(true);
    expect(row.citations).toHaveLength(5);
  });
  it("fits the maximum Unicode response inside the durable report byte cap", () => {
    const row = observedRow(
      {
        question: "界".repeat(2000),
        answer: "界".repeat(4000),
        model_name: "chat_gpt",
        sources: Array.from({ length: 5 }, (_, index) => ({
          url: `https://acme.com/${index}`,
          title: "界".repeat(200),
        })),
      },
      target,
    );
    expect(row.contentTruncated).toBe(true);
    expect(
      agentReportSchema.safeParse({
        kind: "ai_visibility",
        title: "Unicode report",
        body: {
          input: target,
          result: { rows: Array.from({ length: 20 }, () => structuredClone(row)) },
        },
        provenance: {},
      }).success,
    ).toBe(true);
  });
  it("discloses source truncation even when a short ASCII excerpt fits the byte cap", () => {
    expect(
      observedRow(
        { question: "q", answer: "a".repeat(5000), model_name: "chat_gpt", sources: [] },
        target,
      ).contentTruncated,
    ).toBe(true);
  });
  it("rejects deceptive domains and unsafe links", () => {
    const credentialedFixtureUrl = new URL("https://acme.com");
    credentialedFixtureUrl.username = "fixture-user";
    credentialedFixtureUrl.password = "fixture-password";
    expect(citedDomain("https://acme.com.attacker.example", target.domain)).toBe(false);
    const row = observedRow(
      {
        question: "q",
        answer: "answer",
        model_name: "chat_gpt",
        sources: [{ url: "javascript:alert(1)" }, { url: credentialedFixtureUrl.href }],
      },
      target,
    );
    expect(row.citations).toEqual([]);
  });
  it("extracts real response sections and annotations without fabricating citations", () => {
    const row = promptRow(
      {
        model_name: "gpt-4.1-mini",
        items: [{ sections: [{ text: "Try Acme", annotations: [{ url: "https://acme.com" }] }] }],
      },
      { ...target, prompt: "same prompt" },
    );
    expect(row).toMatchObject({
      prompt: "same prompt",
      answer: "Try Acme",
      brandMentioned: true,
      domainCited: true,
    });
  });
  it.each(["gpt-4.1-mini-2025-04-14", undefined, null])(
    "keeps requested and provider-reported model identities distinct (%s)",
    (actualModel) => {
      const row = promptRow(
        {
          model_name: actualModel,
          items: [
            { type: "reasoning", sections: [{ text: "Excluded", annotations: [] }] },
            { type: "message", sections: [{ text: "Answer", annotations: [] }] },
          ],
        },
        { ...target, prompt: "q" },
        "gpt-4.1-mini",
      );
      expect(row).toMatchObject({
        requestedModel: "gpt-4.1-mini",
        actualModel: actualModel ?? null,
        model: actualModel ?? "unknown",
        answer: "Answer",
      });
    },
  );
  it("validates model syntax and rejects duplicate models, oversized prompts and missing cost caps", () => {
    for (const models of [["invalid model/name"], ["gpt-4.1-mini", "gpt-4.1-mini"]])
      expect(
        promptSchema.safeParse({ ...target, prompt: "q", max_cost_cents: 1, models }).success,
      ).toBe(false);
    expect(
      promptSchema.safeParse({
        ...target,
        prompt: "é".repeat(1500),
        max_cost_cents: 1,
        models: ["gpt-4.1-mini"],
      }).success,
    ).toBe(false);
    expect(visibilitySchema.safeParse(target).success).toBe(false);
  });
  it("calculates request+row and conservative token admission costs from capability fixtures", () => {
    expect(
      visibilityCost(
        visibilitySchema.parse({ ...target, max_cost_cents: 20, limit: 3 }),
        capabilities,
      ),
    ).toBeCloseTo(10.3);
    const input = promptSchema.parse({
      ...target,
      prompt: "q",
      max_cost_cents: 60,
      models: ["gpt-4.1-mini", "gpt-4.1-nano"],
      max_output_tokens: 4096,
    });
    expect(modelAdmissionBound("gpt-4.1-mini", input, capabilities)).toBe(4.0792);
    expect(promptCost(input, capabilities)).toBeCloseTo(5.5831);
  });
  it("rejects a syntactically valid model missing from the provider catalog before pricing", () => {
    const input = promptSchema.parse({
      ...target,
      prompt: "q",
      max_cost_cents: 60,
      models: ["gpt-new-future"],
    });
    expect(() => promptCost(input, capabilities)).toThrow(
      "absent from the provider's current catalog",
    );
  });
  it("blocks catalog models when the account's token price is unknown", () => {
    const input = promptSchema.parse({
      ...target,
      prompt: "q",
      max_cost_cents: 60,
      models: ["gpt-4.1-mini"],
    });
    expect(() => promptCost(input, { ...capabilities, modelRates: new Map() })).toThrow(
      "model price must be fresh",
    );
  });
});

it("refuses stale, future and non-official model prices before admission", () => {
  const input = promptSchema.parse({
    ...target,
    prompt: "q",
    max_cost_cents: 60,
    models: ["gpt-4.1-mini"],
  });
  const rate = capabilities.modelRates.get("gpt-4.1-mini");
  if (!rate) throw new Error("Missing fictional rate fixture");
  for (const change of [
    { checkedAt: new Date(Date.now() - 300_001).toISOString() },
    { checkedAt: new Date(Date.now() + 60_000).toISOString() },
    { sourceUrl: "https://untrusted.example/prices" },
    { sourceUrl: "https://api.dataforseo.com.evil.example/prices" },
    { sourceUrl: "https://fixture@api.dataforseo.com/prices" },
    { limitsSourceUrl: "https://untrusted.example/limits" },
    { currencySourceUrl: "https://untrusted.example/currency" },
  ])
    expect(() =>
      promptCost(input, {
        ...capabilities,
        modelRates: new Map([["gpt-4.1-mini", { ...rate, ...change }]]),
      }),
    ).toThrow("verified official source");
});
