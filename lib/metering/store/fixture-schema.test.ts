import { expect, test } from "vitest";
import { migrationStatements, migrationsAfter } from "./fixture-schema.test-fixture";

test.each([
  ["SELECT '--'; SELECT 2;", ["SELECT '--'", "SELECT 2"]],
  ["SELECT 'a;''--b'; SELECT 2;", ["SELECT 'a;''--b'", "SELECT 2"]],
  ['SELECT "a;--b"; SELECT 2;', ['SELECT "a;--b"', "SELECT 2"]],
  [
    "DO $fn$ BEGIN PERFORM ';--'; END; $fn$; SELECT 2;",
    ["DO $fn$ BEGIN PERFORM ';--'; END; $fn$", "SELECT 2"],
  ],
  [
    "/* outer /* inner ; */ ; */ SELECT 1; -- ;\nSELECT 2;",
    ["/* outer /* inner ; */ ; */ SELECT 1", "-- ;\nSELECT 2"],
  ],
  ["SELECT E'a\\';b'; SELECT 2;", ["SELECT E'a\\';b'", "SELECT 2"]],
])("splits statements outside quoted SQL: %s", (sql, expected) => {
  expect(migrationStatements(sql)).toEqual(expected);
});

test("legacy fence upgrade includes every subsequent migration in production order", () => {
  expect(migrationsAfter("20261011020000_accounting_history_snapshot")).toEqual([
    "20261012001000_metering_utc_writers",
    "20261018190000_historical_financial_closeout",
    "20261028190200_metering_unknown_closeout",
    "20261112220000_metering_native_settlement",
  ]);
  expect(() => migrationsAfter("missing")).toThrow("Unknown fixture migration");
});
