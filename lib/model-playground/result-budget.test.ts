import { expect, it } from "vitest";
import { fitModelResultSources, jsonbTextBytes } from "./result-budget";
import { generatedResult, largeResult } from "./result-budget.test-support";
import { modelColumnResultSchema } from "./types";

it.each([
  [1e-7, 9],
  [Number.MIN_VALUE, 326],
  [1e21, 22],
  [-1e21, 23],
  [-0, 1],
  [{ a: [true, false, null], b: '"\\\n' }, 41],
])("counts jsonb text for %j", (value, bytes) => {
  expect(jsonbTextBytes(value)).toBe(bytes);
});

it.each(["\0", "\ud800", "\udfff", Number.NaN, Number.POSITIVE_INFINITY])(
  "never admits unrepresentable JSON %j",
  (value) => {
    expect(jsonbTextBytes(value)).toBe(Number.POSITIVE_INFINITY);
  },
);

it.each([
  [null, null],
  [null, 0],
  [null, Number.MAX_SAFE_INTEGER],
  [150, 50],
  [100, null],
])("preserves unknown counters and accounts for removed sources: %j %j", (total, omitted) => {
  const value = largeResult();
  if (!value.consultedSources) throw new Error("Missing sources");
  value.consultedSources.total = total;
  value.consultedSources.omitted = omitted;
  value.consultedSources.truncated = total !== null ? total > 100 : (omitted ?? 0) > 0;
  const before = structuredClone(value);
  const fitted = fitModelResultSources(value);
  expect(fitted).not.toBeNull();
  const sources = fitted?.consultedSources;
  if (!sources) throw new Error("Missing fitted sources");
  const removed = 100 - sources.sources.length;
  const expected =
    total !== null
      ? total - sources.sources.length
      : omitted !== null && omitted <= Number.MAX_SAFE_INTEGER - removed
        ? omitted + removed
        : null;
  expect(sources).toMatchObject({ total, omitted: expected, truncated: true });
  expect(value).toEqual(before);
});

it("requires no truncation for already fitting evidence", () => {
  const value = largeResult();
  delete value.consultedSources;
  expect(fitModelResultSources(value)).toBe(value);
});

it("generates schema-valid result bounds", () => {
  for (let seed = 0; seed < 64; seed++) {
    const parsed = modelColumnResultSchema.safeParse(generatedResult(seed));
    expect(parsed.error?.issues, `seed ${seed}`).toBeUndefined();
  }
});

it.each([
  new Date(0),
  Object.assign(Object.create({ inherited: true }), { a: 1 }),
  { toJSON: () => "x".repeat(300000) },
  Object.assign([], { toJSON: () => "hidden" }),
  Object.setPrototypeOf([], { custom: true }),
])("rejects custom serialization and non-plain prototypes at index %$", (value) => {
  expect(jsonbTextBytes(value)).toBe(Number.POSITIVE_INFINITY);
});
it("accepts ordinary null-prototype JSON", () => {
  expect(jsonbTextBytes(Object.assign(Object.create(null), { a: 1 }))).toBe(8);
});
