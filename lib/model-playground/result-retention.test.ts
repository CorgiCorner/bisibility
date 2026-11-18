import { expect, test } from "vitest";
import { persistedModelResult } from "./execution-storage";
import { fitsModelResult } from "./result-budget";
import { largeResult, oversizedCitations } from "./result-budget.test-support";
import { MODEL_PLAYGROUND_LIMITS } from "./schema";

test("oversized citations retain the complete paid answer and truthful counts", () => {
  const original = oversizedCitations();
  const value = persistedModelResult(original);
  expect(value.answer).toBe(original.answer);
  expect(value.failure).toBeNull();
  expect(value.state).toBe("completed");
  expect(fitsModelResult(value)).toBe(true);
  expect(value.citations.length).toBeGreaterThan(0);
  expect(value.citationTotals).toEqual({ total: 100, omitted: 100 - value.citations.length });
  expect(value.usage).toEqual(original.usage);
  expect(value.costEvidence).toEqual(original.costEvidence);
  expect(original.citations).toHaveLength(100);
});

test("unknown source and citation totals stay unknown after fitting", () => {
  const original = oversizedCitations();
  original.citationTotals = { total: null, omitted: null };
  original.truncation.citations = true;
  if (!original.consultedSources) throw new Error("Missing fixture");
  original.consultedSources = {
    ...original.consultedSources,
    total: null,
    omitted: null,
    truncated: true,
  };
  const value = persistedModelResult(original);
  expect(value.answer).toBe(original.answer);
  expect(value.citationTotals).toEqual({ total: null, omitted: null });
  expect(value.consultedSources).toMatchObject({ total: null, omitted: null, truncated: true });
  expect(fitsModelResult(value)).toBe(true);
});

test("a long multibyte answer is explicitly shortened without becoming an answerless failure", () => {
  const original = largeResult();
  original.answer = "😀".repeat(20_000);
  original.citations = [{ ...original.citations[0], start: 30_000, end: 30_002 }];
  original.citationTotals = { total: 1, omitted: 0 };
  const value = persistedModelResult(original);
  expect(value.answer).toBe("😀".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes / 4));
  expect(value.truncation.application).toBe(true);
  expect(value.citations[0]).toMatchObject({ start: null, end: null });
  expect(value.failure).toBeNull();
  expect(value.state).toBe("partial");
  expect(fitsModelResult(value)).toBe(true);
  expect(value.providerCost).toEqual(original.providerCost);
});

test("an empty complete consulted-source list stays complete while citations are trimmed", () => {
  const original = oversizedCitations();
  original.consultedSources = { sources: [], total: 0, omitted: 0, truncated: false };
  const value = persistedModelResult(original);
  expect(value.answer).toBe(original.answer);
  expect(value.consultedSources).toEqual(original.consultedSources);
  expect(value.citations.length).toBeLessThan(original.citations.length);
  expect(fitsModelResult(value)).toBe(true);
});

test.each(["costEvidence", "routingAttemptCredentials"] as const)(
  "oversized %s metadata keeps a complete paid answer with explicit retention flags",
  (field) => {
    const original = largeResult();
    delete original.consultedSources;
    Object.assign(original, { [field]: { oversized: "x".repeat(300_000) } });
    const value = persistedModelResult(original);
    expect(value.answer).toBe(original.answer);
    expect(value.state).toBe("completed");
    expect(value.failure).toBeNull();
    expect(value.truncation).toMatchObject({ application: false, metadata: true });
    expect(value.costEvidence).toBeUndefined();
    expect(value.routingAttemptCredentials).toEqual({
      version: 1,
      completeness: "unknown",
      attempts: [],
    });
    expect(value.providerCost).toEqual(original.providerCost);
    expect(fitsModelResult(value)).toBe(true);
    expect(original[field]).toHaveProperty("oversized");
  },
);
