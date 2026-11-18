import { expect, it } from "vitest";
import { safeModelJson } from "./transport-io";

const options = {
  moneyPaths: [
    ["usage", "cost"],
    ["items", 0, "amount"],
  ],
} as const;
it("projects monetary wire lexemes exactly while preserving existing number reads", () => {
  const text =
    '{"usage":{"cost":0.12345678901234567890123456789,"tokens":123},"items":[{"amount":9007199254740993}],"cost":7}';
  expect(safeModelJson(text, options)).toEqual({
    usage: { cost: "0.12345678901234567890123456789", tokens: 123 },
    items: [{ amount: "9007199254740993" }],
    cost: 7,
  });
  expect(safeModelJson(text).usage).toEqual({ cost: JSON.parse(text).usage.cost, tokens: 123 });
});
it.each([
  ["1.234567890123456789e-12", "0.000000000001234567890123456789"],
  ["1e2", "100"],
  ["1e-325", `0.${"0".repeat(324)}1`],
  ["0", "0"],
])("expands %s without a floating point round trip", (literal, expected) => {
  expect(safeModelJson(`{"usage":{"cost":${literal}}}`, options).usage).toEqual({ cost: expected });
});
it.each([
  "1e309",
  "NaN",
  "Infinity",
  "-Infinity",
  "1e999999",
  "1e-999999",
  "1".repeat(257),
  `0.${"0".repeat(256)}1`,
])("rejects unsafe numeric literal %s with the fixed error", (literal) => {
  expect(() => safeModelJson(`{"usage":{"cost":${literal}}}`, options)).toThrow(
    "Model provider returned an invalid response.",
  );
});
it.each([
  { moneyPaths: [["__proto__", "cost"]] },
  { moneyPaths: [["usage", -1]] },
  { moneyPaths: [], endpoint: "https://example.org" },
])("rejects malformed opt-in configuration", (options) => {
  expect(() => safeModelJson('{"ok":true}', options as never)).toThrow(
    "Model provider returned an invalid response.",
  );
});
it("uses structural paths and ignores number-looking strings", () => {
  expect(
    safeModelJson(
      '{"usage":{"c\\u006fst":1e-3},"items":[{"amount":"1e3"},{"amount":0.5}]}',
      options,
    ),
  ).toEqual({ usage: { cost: "0.001" }, items: [{ amount: "1e3" }, { amount: 0.5 }] });
});
