import { afterEach, describe, expect, it, vi } from "vitest";
import { safeModelJson } from "./transport-io";
import { baseModelJson } from "./transport-json-base.test-support";

const invalidResponse = "Model provider returned an invalid response.";
const options = { moneyPaths: [["cost"]] } as const;
const cases = [
  ["ordinary numbers", '{"integer":42,"fraction":0.125,"negative":-2,"zero":-0}'],
  ["300-digit literal", `{"value":${"9".repeat(300)}}`],
  ["overflow", '{"value":1e400}'],
  ["underflow", '{"value":1e-3000}'],
  ["nested numbers", '{"nested":[{"value":1e400},1e-3000,9007199254740993]}'],
  ["numbers inside strings", `{"value":"${"9".repeat(300)} 1e400 1e-3000"}`],
  ["duplicate keys", '{"value":1e400,"value":-0}'],
  ["invalid JSON", '{"value":NaN}'],
  ["array root", "[1,2]"],
  ["null root", "null"],
  ["forbidden key", '{"nested":{"constructor":1}}'],
  ["excessive depth", `${'{"child":'.repeat(66)}{}${"}".repeat(66)}`],
] as const;
function outcome(parse: () => unknown) {
  try {
    return { accepted: true, value: parse() };
  } catch {
    return { accepted: false };
  }
}

afterEach(() => vi.restoreAllMocks());
describe.each([undefined, { moneyPaths: [] }])("base compatibility with options %j", (config) => {
  it.each(cases)("C1 differential: %s", (_, text) => {
    expect(outcome(() => safeModelJson(text, config))).toEqual(outcome(() => baseModelJson(text)));
  });
});

it("C1 applies monetary limits only at declared paths", () => {
  const text = `{"cost":0.10,"large":${"9".repeat(300)},"nested":{"over":1e400,"under":1e-3000}}`;
  expect(safeModelJson(text, options)).toEqual({ ...baseModelJson(text), cost: "0.10" });
});

function withoutReviverSource() {
  const parse = JSON.parse;
  vi.spyOn(JSON, "parse").mockImplementation((text, reviver) =>
    parse(
      text,
      reviver &&
        function (this: unknown, key: string, value: unknown) {
          return reviver.call(this, key, value);
        },
    ),
  );
}
it("C1 preserves base behavior when reviver source is unavailable without money paths", () => {
  withoutReviverSource();
  expect(safeModelJson('{"value":1e400}')).toEqual({ value: Number.POSITIVE_INFINITY });
});
it("C1 rejects a selected number with the fixed error when reviver source is unavailable", () => {
  withoutReviverSource();
  expect(() => safeModelJson('{"cost":0.10}', options)).toThrow(invalidResponse);
});
it("C1 needs no source for unrelated numbers or monetary strings", () => {
  withoutReviverSource();
  expect(safeModelJson('{"cost":"0.10","value":1e400}', options)).toEqual({
    cost: "0.10",
    value: Number.POSITIVE_INFINITY,
  });
});

it.each([
  ["-1", "-1"],
  ["-0.50", "-0.50"],
  ["-1.25e2", "-125"],
  ["-0", "0"],
  ["-0.0", "0.0"],
  ["-0.000", "0.000"],
  ["-0.00e-2", "0.0000"],
])("C4 retains sign and scale for %s", (literal, expected) => {
  expect(safeModelJson(`{"cost":${literal}}`, options)).toEqual({ cost: expected });
});
it.each([
  ['{"cost":1e400,"cost":-0.00}', { cost: "0.00" }],
  ['{"cost":0.1,"cost":0.200}', { cost: "0.200" }],
  ['{"cost":0.1,"cost":"unchanged"}', { cost: "unchanged" }],
  ['{"nested":{"cost":1e400},"nested":{"cost":-0.0}}', { nested: { cost: "0.0" } }],
])("C4 uses only the last duplicate key: %s", (text, expected) => {
  expect(safeModelJson(text, { moneyPaths: [["cost"], ["nested", "cost"]] })).toEqual(expected);
});
