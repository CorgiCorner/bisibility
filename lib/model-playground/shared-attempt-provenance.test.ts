import { expect, it } from "vitest";
import {
  invalidProvenance,
  provenanceResult,
  routingCredentials,
} from "./attempt-provenance.test-support";
import { result } from "./contract-fixtures.test-support";
import { modelColumnResultSchema } from "./types";

it("round-trips bounded credential provenance and a partial consistency discard", () => {
  const value = provenanceResult();
  expect(modelColumnResultSchema.parse(value)).toEqual(value);
  value.routingAttemptCredentials.attempts = Array(100).fill(routingCredentials().attempts[0]);
  expect(modelColumnResultSchema.parse(value)).toEqual(value);
});

it.each(invalidProvenance.map((patch, index) => ({ patch, index })))(
  "rejects unknown keys, free text and malformed provenance $index",
  ({ patch }) => {
    expect(modelColumnResultSchema.safeParse({ ...result(), ...patch }).success).toBe(false);
  },
);

it("requires a dropped slot for an inconsistent breakdown", () => {
  const value = provenanceResult();
  const money = value.costEvidence.upstreamInference?.total;
  if (!money) throw new Error("Missing test cost");
  value.costEvidence.upstreamInference = { total: money, input: money, output: money };
  expect(modelColumnResultSchema.safeParse(value).success).toBe(false);
  value.costEvidence.upstreamInference = null;
  expect(modelColumnResultSchema.parse(value)).toEqual(value);
});

it("keeps absence backward compatible without inserting evidence", () => {
  expect(modelColumnResultSchema.parse(result())).toEqual(result());
});

it("accepts an explicitly null discard reason and partial or unknown lists", () => {
  for (const completeness of ["partial", "unknown"] as const) {
    const value = provenanceResult();
    expect(
      modelColumnResultSchema.parse({
        ...value,
        costEvidence: { ...value.costEvidence, upstreamInferenceDiscardReason: null },
        routingAttemptCredentials: { version: 1, completeness, attempts: [] },
      }).routingAttemptCredentials?.completeness,
    ).toBe(completeness);
  }
});
