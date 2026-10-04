import { agentReportSchema } from "@/lib/agent-reports/model";
import { describe, expect, it } from "vitest";
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
  it("rejects unknown or duplicate models, oversized prompts and missing cost caps", () => {
    for (const models of [["made-up"], ["gpt-4.1-mini", "gpt-4.1-mini"]])
      expect(
        promptSchema.safeParse({ ...target, prompt: "q", max_cost_cents: 1, models }).success,
      ).toBe(false);
    expect(
      promptSchema.safeParse({ ...target, prompt: "é".repeat(1500), max_cost_cents: 1 }).success,
    ).toBe(false);
    expect(visibilitySchema.safeParse(target).success).toBe(false);
  });
  it("calculates current sourced request+row and conservative token admission costs", () => {
    expect(
      visibilityCost(visibilitySchema.parse({ ...target, max_cost_cents: 20, limit: 3 })),
    ).toBeCloseTo(10.3);
    expect(modelAdmissionBound("gpt-4.1-mini")).toBeCloseTo(42.045);
    expect(
      promptCost(promptSchema.parse({ ...target, prompt: "q", max_cost_cents: 60 })),
    ).toBeCloseTo(52.6013);
  });
});
