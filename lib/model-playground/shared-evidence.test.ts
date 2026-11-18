import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { preview, result, unknownMoney } from "./contract-fixtures.test-support";
import { MODEL_PLAYGROUND_LIMITS } from "./schema";
import { modelColumnResultSchema, serializeModelPlaygroundReport } from "./types";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

const source = (index = 0) => ({
  sourceId: `consulted-${index}`,
  url: `https://example.org/${index}`,
  title: null,
});
const sources = () => ({ sources: [source()], total: null, omitted: null, truncated: false });
const money = () => ({
  ...unknownMoney,
  amount: "0.000000000000000123456789",
  certainty: "reported",
  basis: "provider_response",
});
const scope = () => ({
  kind: "subtotal",
  includes: ["inference", "tools"],
  excludes: ["reporting_writes", "zero_data_retention"],
  unknown: ["routing", "other"],
});
const costs = () => ({
  providerReported: { money: money(), scope: scope() },
  upstreamInference: { total: money(), input: null, output: null },
  localEstimate: {
    ...money(),
    certainty: "estimated",
    basis: "rate_card",
    rateCardVersion: "rates-v1",
  },
});

it("keeps legacy stored shapes unchanged and new unknown counters null", () => {
  expect(modelColumnResultSchema.parse(result())).toEqual(result());
  const value = {
    ...result(),
    consultedSources: sources(),
    citationTotals: { total: null, omitted: null },
  };
  const parsed = modelColumnResultSchema.parse(value);
  expect(parsed.consultedSources?.total).toBeNull();
  expect(parsed.consultedSources?.omitted).toBeNull();
  expect(parsed.citationTotals).toEqual({ total: null, omitted: null });
  expect(parsed.citations).toHaveLength(2);
  expect(JSON.parse(serializeModelPlaygroundReport([parsed], preview()).body).columns[0]).toEqual(
    value,
  );
});

it("bounds consulted sources independently from 100 citation occurrences", () => {
  expect(MODEL_PLAYGROUND_LIMITS.consultedSources).toBe(100);
  const value = {
    ...result(),
    consultedSources: { ...sources(), sources: Array.from({ length: 100 }, (_, i) => source(i)) },
  };
  expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
  value.consultedSources.sources.push(source(100));
  expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
});

it.each(["javascript:alert(1)", "ftp://example.org/a", "https://user:pass@example.com/a"])(
  "rejects unsafe consulted URL %s",
  (url) => {
    expect(
      modelColumnResultSchema.safeParse({
        ...result(),
        consultedSources: { ...sources(), sources: [{ ...source(), url }] },
      }).success,
    ).toBe(false);
  },
);

it("requires honest consulted and citation omissions without inventing totals", () => {
  for (const changes of [
    { total: 2 },
    { omitted: 1 },
    { total: 0 },
    { total: 3, omitted: 1, truncated: true },
    { omitted: -1 },
  ])
    expect(
      modelColumnResultSchema.safeParse({
        ...result(),
        consultedSources: { ...sources(), ...changes },
      }).success,
    ).toBe(false);
  for (const changes of [
    { total: 2, omitted: 1 },
    { total: null, omitted: null },
  ])
    expect(
      modelColumnResultSchema.safeParse({
        ...result(),
        consultedSources: { ...sources(), ...changes, truncated: true },
      }).success,
    ).toBe(true);
  expect(
    modelColumnResultSchema.safeParse({ ...result(), citationTotals: { total: 3, omitted: 1 } })
      .success,
  ).toBe(false);
  expect(
    modelColumnResultSchema.safeParse({
      ...result(),
      state: "partial",
      truncation: { ...result().truncation, citations: true },
      citationTotals: { total: 3, omitted: 1 },
    }).success,
  ).toBe(true);
});

it("rejects duplicate consulted identities", () => {
  expect(
    modelColumnResultSchema.safeParse({
      ...result(),
      consultedSources: { ...sources(), sources: [source(), source()] },
    }).success,
  ).toBe(false);
});

it("rejects conflicting citation URLs using an explicit shared source identity", () => {
  const citation = {
    occurrenceId: "explicit-occurrence",
    sourceId: "shared-source",
    url: "https://example.org/cited",
    title: null,
    start: null,
    end: null,
  };
  const value = {
    ...result(),
    citations: [citation],
    consultedSources: {
      ...sources(),
      sources: [
        {
          sourceId: citation.sourceId,
          url: "https://example.org/consulted",
          title: null,
        },
      ],
    },
  };
  const parsed = modelColumnResultSchema.safeParse(value);
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(parsed.error.issues.map((issue) => issue.message)).toContain(
      "A source ID must have one canonical URL.",
    );
  value.consultedSources.sources[0].url = citation.url;
  expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
});

it("retains account money, upstream inference and estimates separately with scope", () => {
  const value = { ...result(), costEvidence: costs() };
  expect(modelColumnResultSchema.parse(value)).toEqual(value);
  expect(
    modelColumnResultSchema.parse({
      ...result(),
      costEvidence: { providerReported: null, upstreamInference: null, localEstimate: null },
    }).costEvidence?.providerReported,
  ).toBeNull();
});

it.each(["providerReported", "upstreamInference"])("rejects estimated money in %s", (field) => {
  const costEvidence = costs();
  const estimate = costEvidence.localEstimate;
  const invalid =
    field === "providerReported"
      ? { ...costEvidence, providerReported: { ...costEvidence.providerReported, money: estimate } }
      : {
          ...costEvidence,
          upstreamInference: { ...costEvidence.upstreamInference, total: estimate },
        };
  expect(modelColumnResultSchema.safeParse({ ...result(), costEvidence: invalid }).success).toBe(
    false,
  );
});

it("rejects reported local estimates, contradictory scopes and numeric money", () => {
  for (const changes of [
    { localEstimate: money() },
    { providerReported: { money: { ...money(), amount: 0 }, scope: scope() } },
    { providerReported: { money: money(), scope: { ...scope(), excludes: ["inference"] } } },
    { providerReported: { money: money(), scope: { ...scope(), kind: "total" } } },
  ])
    expect(
      modelColumnResultSchema.safeParse({ ...result(), costEvidence: { ...costs(), ...changes } })
        .success,
    ).toBe(false);
});
