import { agentReportSchema, externalAgentReportSchema } from "@/lib/agent-reports/model";
import { describe, expect, it } from "vitest";
import { input, result } from "./contract-fixtures.test-support";
import {
  buildModelPlaygroundReport,
  combinedReportedCost,
  modelPlaygroundReportSchema,
} from "./report-body";

describe("composite report", () => {
  it("retains full answers and exact choices without private evidence", () => {
    const column = {
      ...result(),
      answer: "answer ".repeat(700),
      rawEvidenceId: "private-evidence",
    };
    const body = buildModelPlaygroundReport(crypto.randomUUID(), input(), [column], []);
    expect(body.results[0].answer).toBe(column.answer);
    expect(body.input).toEqual(input());
    expect(JSON.stringify(body)).not.toMatch(
      /rawEvidenceId|paymentReceipt|credentialVersion|accountDigest|routingAttemptCredentials/,
    );
    expect(modelPlaygroundReportSchema.safeParse({ ...body, version: 2 }).success).toBe(false);
    expect(modelPlaygroundReportSchema.safeParse({ ...body, apiKey: "synthetic" }).success).toBe(
      false,
    );
  });
  it.each(["unknown", "estimated", "mixed"])("keeps %s combined cost unknown", (mode) => {
    const a = result();
    a.providerCost = {
      amount: "0.12",
      currency: "USD",
      certainty: "reported",
      basis: "provider_response",
      rateCardVersion: null,
    };
    a.costEvidence = {
      providerReported: {
        money: a.providerCost,
        scope: {
          kind: "total",
          includes: [
            "inference",
            "tools",
            "routing",
            "reporting_writes",
            "zero_data_retention",
            "other",
          ],
          excludes: [],
          unknown: [],
        },
      },
      upstreamInference: null,
      localEstimate: null,
    };
    const b = structuredClone(a);
    if (mode === "unknown") b.providerCost = result().providerCost;
    if (mode === "estimated")
      b.providerCost = {
        ...a.providerCost,
        certainty: "estimated",
        basis: "rate_card",
        rateCardVersion: "test",
      };
    if (mode === "mixed") b.providerCost = { ...a.providerCost, currency: "EUR" };
    if (b.costEvidence?.providerReported) b.costEvidence.providerReported.money = b.providerCost;
    expect(combinedReportedCost([a, b])).toEqual({ kind: "unknown" });
    expect(combinedReportedCost([a, a])).toEqual({
      kind: "amount",
      amount: { value: "0.24", unit: { kind: "currency", code: "USD" }, certainty: "measured" },
    });
  });
  it("rejects a mismatched result or a nested credential field", () => {
    const b = buildModelPlaygroundReport(crypto.randomUUID(), input(), [result()], []);
    expect(modelPlaygroundReportSchema.safeParse({ ...b, results: [] }).success).toBe(false);
    expect(
      modelPlaygroundReportSchema.safeParse({ ...b, input: { ...b.input, apiKey: "synthetic" } })
        .success,
    ).toBe(false);
    expect(
      modelPlaygroundReportSchema.safeParse({
        ...b,
        results: [{ ...b.results[0], credentials: {} }],
      }).success,
    ).toBe(false);
  });
});

it("requires explicit total cost scope, including when legacy providerCost is reported", () => {
  const a = result();
  a.providerCost = {
    amount: "1",
    currency: "USD",
    certainty: "reported",
    basis: "provider_response",
    rateCardVersion: null,
  };
  expect(combinedReportedCost([a])).toEqual({ kind: "unknown" });
  for (const kind of ["unknown", "subtotal", "total"] as const) {
    a.costEvidence = {
      providerReported: {
        money: a.providerCost,
        scope: {
          kind,
          includes:
            kind === "total"
              ? [
                  "inference",
                  "tools",
                  "routing",
                  "reporting_writes",
                  "zero_data_retention",
                  "other",
                ]
              : ["inference"],
          excludes: [],
          unknown:
            kind === "total"
              ? []
              : ["tools", "routing", "reporting_writes", "zero_data_retention", "other"],
        },
      },
      upstreamInference: null,
      localEstimate: null,
    };
    expect(combinedReportedCost([a]).kind).toBe(kind === "total" ? "amount" : "unknown");
  }
});
it("rejects external native-format reports and accepts ordinary external analyses", () => {
  const body = buildModelPlaygroundReport(crypto.randomUUID(), input(), [result()], []);
  for (const kind of ["prompt_explorer", "manual_analysis"])
    expect(externalAgentReportSchema.safeParse({ kind, title: "Forged", body }).success).toBe(
      false,
    );
  expect(
    externalAgentReportSchema.safeParse({
      kind: "manual_analysis",
      title: "Analysis",
      body: { text: "external" },
    }).success,
  ).toBe(true);
});
it("aligns the largest byte-budget report with the enclosing schema and rejects excess nodes", () => {
  const body = buildModelPlaygroundReport(
    crypto.randomUUID(),
    input(),
    [result()],
    [
      {
        id: "brand",
        label: "Brand",
        kind: "project",
        domain: null,
        aliases: [""],
        excludedNames: [],
      },
    ],
  );
  const remaining = 256 * 1024 - new TextEncoder().encode(JSON.stringify(body)).length;
  body.entities[0].aliases[0] = "a".repeat(remaining);
  expect(new TextEncoder().encode(JSON.stringify(body)).length).toBe(256 * 1024);
  expect(modelPlaygroundReportSchema.safeParse(body).success).toBe(true);
  expect(agentReportSchema.safeParse({ kind: "prompt_explorer", title: "Max", body }).success).toBe(
    true,
  );
  body.entities[0].aliases[0] += "a";
  expect(modelPlaygroundReportSchema.safeParse(body).success).toBe(false);
  body.entities[0].aliases = Array.from({ length: 20001 }, () => "a");
  expect(modelPlaygroundReportSchema.safeParse(body).success).toBe(false);
});
