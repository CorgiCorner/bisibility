import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { readActionPaymentConsent, sealActionPaymentConsent } from "./durable-consent";

afterEach(() => vi.useRealTimers());
it("retains accepted authority after browser TTL without granting another scope", () => {
  const sealed = sealActionPaymentConsent({ run: "runA", project: "projectA" });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01"));
  expect(
    readActionPaymentConsent(
      sealed,
      z.object({ run: z.literal("runA"), project: z.literal("projectA") }).strict(),
    ),
  ).toEqual({ run: "runA", project: "projectA" });
  expect(() => readActionPaymentConsent(sealed, z.object({ run: z.literal("runB") }))).toThrow(
    "payment_quote_changed",
  );
});
it("rejects altered bytes and malformed schema", () => {
  const sealed = sealActionPaymentConsent({ payer: "byok" });
  expect(() =>
    readActionPaymentConsent(
      { ...sealed, encoded: Buffer.from('{"payer":"platform"}').toString("base64url") },
      z.object({ payer: z.string() }),
    ),
  ).toThrow("payment_quote_changed");
  expect(() => readActionPaymentConsent(sealed, z.object({ missing: z.string() }))).toThrow(
    "payment_quote_changed",
  );
});
