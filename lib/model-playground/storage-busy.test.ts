import { expect, test } from "vitest";
import { isModelStorageBusy } from "./storage-busy";

test.each([
  { code: "P2024" },
  { code: "P2028" },
  { code: "P2034" },
  { code: "55P03" },
  { meta: { code: "57014" } },
  { meta: { driverAdapterError: { cause: { originalCode: "55P03" } } } },
  { cause: { code: "40P01" } },
  { code: "storage", storageBusy: true },
])("recognizes rolled-back storage contention %j", (value) => {
  expect(isModelStorageBusy(value)).toBe(true);
});

test.each([
  null,
  new Error("Network lost"),
  { code: "23505" },
  { code: "storage", storageBusy: false },
])("does not retry arbitrary failures %j", (value) => {
  expect(isModelStorageBusy(value)).toBe(false);
});
