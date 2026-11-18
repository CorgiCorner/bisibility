import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  input,
  preview,
  result,
  unknownMoney,
  unknownUsage,
} from "./contract-fixtures.test-support";
import {
  modelColumnResultSchema,
  modelMoneySchema,
  modelPlaygroundPreviewSchema,
  modelUsageSchema,
  serializeModelPlaygroundReport,
} from "./types";

const outbound = vi.fn(() => {
  throw new Error("Unexpected network call");
});
beforeEach(() => vi.stubGlobal("fetch", outbound));
afterEach(() => {
  expect(outbound).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("Model Playground retained evidence", () => {
  it("round-trips unknown money independently from measured usage", () => {
    const value = result();
    value.usage = {
      ...unknownUsage,
      completeness: "complete",
      inputTokens: 120,
      outputTokens: 40,
      reasoningTokens: 10,
      cacheReadInputTokens: 20,
      cacheWriteInputTokens: 5,
      inputCacheAccounting: "included",
    };
    expect(modelColumnResultSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(modelMoneySchema.parse(unknownMoney).amount).toBeNull();
    expect(modelUsageSchema.parse(unknownUsage).inputTokens).toBeNull();
  });
  it("retains fractional reported costs and explicit zero without coercion", () => {
    for (const amount of ["0", "0.00012345"]) {
      const money = { ...unknownMoney, amount, certainty: "reported", basis: "provider_response" };
      expect(modelMoneySchema.parse(money).amount).toBe(amount);
    }
    const estimated = {
      ...unknownMoney,
      amount: "0.0001",
      certainty: "estimated",
      basis: "rate_card",
      rateCardVersion: "rates-2026-11-11",
    };
    expect(modelMoneySchema.parse(estimated).certainty).toBe("estimated");
    for (const changes of [
      { certainty: "reported" },
      { basis: "provider_response" },
      { rateCardVersion: null },
      { amount: null },
    ])
      expect(modelMoneySchema.safeParse({ ...estimated, ...changes }).success).toBe(false);
    expect(modelMoneySchema.safeParse({ ...unknownMoney, amount: "0" }).success).toBe(false);
  });
  it("refuses impossible subsets, non-finite counts and invented unknown zero", () => {
    for (const changes of [
      { inputTokens: 0 },
      { outputTokens: Number.NaN },
      { outputTokens: Number.POSITIVE_INFINITY },
      { searchCalls: -1 },
      { cacheReadInputTokens: 1.5 },
    ])
      expect(modelUsageSchema.safeParse({ ...unknownUsage, ...changes }).success).toBe(false);
    const usage = {
      ...unknownUsage,
      completeness: "complete",
      inputTokens: 20,
      outputTokens: 10,
      reasoningTokens: 11,
    };
    expect(modelUsageSchema.safeParse(usage).success).toBe(false);
    usage.reasoningTokens = 5;
    Object.assign(usage, { inputCacheAccounting: "included", cacheReadInputTokens: 25 });
    expect(modelUsageSchema.safeParse(usage).success).toBe(false);
    Object.assign(usage, { inputCacheAccounting: "additional" });
    expect(modelUsageSchema.safeParse(usage).success).toBe(true);
  });
  it("retains actual model separately and more than five source occurrences", () => {
    const value = result();
    value.actualModelId = "vendor/actual-revision";
    value.citations = Array.from({ length: 100 }, (_, index) => ({
      ...value.citations[0],
      occurrenceId: `occurrence-${index}`,
    }));
    expect(modelColumnResultSchema.parse(value).citations).toHaveLength(100);
    value.citations.push({ ...value.citations[0], occurrenceId: "overflow" });
    expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
  });
  it("requires honest truncation and retains up to 24 KiB of UTF-8 answer", () => {
    const value = result();
    value.answer = "😀".repeat(6144);
    expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
    value.answer += "a";
    expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
    value.answer = "a".repeat(5000);
    value.truncation.application = true;
    expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
    value.state = "partial";
    expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
  });
  it("rejects unsafe links, duplicate identities and out-of-answer offsets", () => {
    for (const url of [
      "not a URL",
      "javascript:alert(1)",
      "https://user:pass@example.com/source",
    ]) {
      const value = result();
      value.citations[0].url = url;
      expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
    }
    const value = result();
    value.citations[1].occurrenceId = value.citations[0].occurrenceId;
    expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
    value.citations = [value.citations[0]];
    value.citations[0].end = 1000;
    expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
  });
  it("rejects receipts from another provider, connection, funding or option", () => {
    const value = result();
    value.paymentReceipt = {
      actionId: "action-example",
      quoteId: null,
      state: "unknown",
      option: {
        id: value.column.payment.optionId,
        connectionId: value.column.connectionId,
        providerId: value.column.providerId,
        providerLabel: "Example",
        fundingSource: "byok",
        payableUnit: { kind: "currency", code: "USD" },
      },
      charge: { value: null, certainty: "unknown", unit: { kind: "currency", code: "USD" } },
    };
    expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
    for (const changes of [
      { id: "other" },
      { providerId: "openai" },
      { connectionId: "conn_bbbbbbbbbbbbbbbbbbbbbbbb" },
      { fundingSource: "platform" },
    ])
      expect(
        modelColumnResultSchema.safeParse({
          ...value,
          paymentReceipt: {
            ...value.paymentReceipt,
            option: { ...value.paymentReceipt.option, ...changes },
          },
        }).success,
      ).toBe(false);
  });
  it("serializes only matching frozen columns and checks independent JSON limits", () => {
    const serialized = serializeModelPlaygroundReport([result()], preview());
    expect(JSON.parse(serialized.body).columns).toEqual([result()]);
    expect(JSON.parse(serialized.provenance)).toEqual(preview());
    const changed = result();
    changed.column.settings.maxOutputTokens = 1024;
    expect(() => serializeModelPlaygroundReport([changed], preview())).toThrow();
    expect(() => serializeModelPlaygroundReport([result(), result()], preview())).toThrow();
    const large = result();
    large.citations = Array.from({ length: 100 }, (_, index) => ({
      ...large.citations[0],
      occurrenceId: `citation-${index}`,
      title: "a".repeat(512),
      url: `https://example.org/${"a".repeat(2000)}`,
    }));
    expect(() => serializeModelPlaygroundReport([large], preview())).toThrow(/byte budget/);
  });
  it("rejects invalid preview binding and unbounded provenance", () => {
    const value = preview();
    value.columns[0].columnId = "019a70b2-0000-7000-8000-000000000002";
    expect(modelPlaygroundPreviewSchema.safeParse(value).success).toBe(false);
    const large = preview();
    large.columns[0].providerEstimate = {
      ...unknownMoney,
      amount: "1".repeat(2048),
      certainty: "estimated",
      basis: "rate_card",
      rateCardVersion: "r".repeat(256),
    };
    large.input.columns = Array.from({ length: 6 }, (_, index) => ({
      ...input().columns[0],
      columnId: `019a70b2-0000-7000-8000-00000000000${index}`,
      modelId: "a".repeat(256),
      connectionId: input().columns[0].connectionId,
      payment: { optionId: "a".repeat(256), fundingSource: "byok" },
    }));
    large.columns = large.input.columns.map((column) => ({
      ...large.columns[0],
      columnId: column.columnId,
    }));
    // This valid bounded preview stays under the independent 32 KiB limit.
    expect(() =>
      serializeModelPlaygroundReport([{ ...result(), column: large.input.columns[0] }], large),
    ).not.toThrow();
    expect(modelPlaygroundPreviewSchema.safeParse({ ...preview(), apiKey: "canary" }).success).toBe(
      false,
    );
  });
});
