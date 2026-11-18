import { Prisma } from "@/lib/generated/prisma/client";
import { expect, test, vi } from "vitest";
import { exactNumericRows } from "./numeric";
import { utcPostgresDriver } from "./timestamp-policy";

vi.mock("./timestamp-history", () => ({
  ensureTimestampContract: vi.fn(),
  requireTimestampContract: vi.fn(),
}));

test.each([
  "92233720368547758079223372036854775807",
  "0.000000000000000001",
  "-1234567890123456789012",
])("the host driver exposes numeric %s without exponent notation or rounding", async (value) => {
  const decimal = new Prisma.Decimal(value);
  const driver = utcPostgresDriver(
    {
      transaction: async (_readOnly, body) =>
        body({
          query: async <T>() =>
            [{ amount: decimal, total: decimal, count: 9223372036854775807n }] as T[],
          execute: async () => 0,
        }),
    },
    "fixture",
  );
  const rows = await driver.transaction(false, (sql) =>
    sql.query({ text: "SELECT amount,total,count", values: [] }),
  );
  expect(rows).toEqual([{ amount: value, total: value, count: "9223372036854775807" }]);
});

test("leaves JSON Decimal lookalikes, nulls and ordinary numbers untouched", () => {
  const body = { toStringTag: "[object Decimal]", value: "retained metadata" };
  expect(
    exactNumericRows([{ body, missing: null, scale: 18, amount: new Prisma.Decimal("123") }]),
  ).toEqual([{ body, missing: null, scale: 18, amount: "123" }]);
});
