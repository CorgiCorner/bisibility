import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MonitorConsentBinding, signMonitorConsent, verifyMonitorConsent } from "./consent";

const now = new Date("2026-10-12T12:00:00.000Z");
const binding: MonitorConsentBinding = {
  actorId: "actor",
  projectId: "project",
  monitorId: "monitor",
  monitorVersion: 2,
  revisionId: "revision",
  scheduleIntentId: "intent",
  connectionId: "connection",
  connectionStamp: "private-hash",
  targetIds: ["a", "b"],
  idempotencyKey: "request",
  quote: {
    version: 1,
    projectId: "project",
    expectedTargetKeys: ["key-a", "key-b"],
    effectiveOptions: { surface: "maps" },
    capabilityVersion: "capability",
    provider: "dataforseo",
    adapterVersion: "adapter",
    providerPriceVersion: "price",
    nativeEstimates: [{ unit: "USD", amount: "0.0012" }],
    issuedAt: now.toISOString(),
    expiresAt: "2026-10-12T12:05:00.000Z",
  },
};
beforeEach(() => {
  process.env.BISIBILITY_SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
});
afterEach(() => {
  delete process.env.BISIBILITY_SECRETS_KEY;
});
describe("manual monitor signed cost consent", () => {
  it("preserves exact native amounts and bounds validity by the quote", () => {
    const signed = signMonitorConsent(binding, now);
    expect(signed.expiresAt).toBe(binding.quote.expiresAt);
    expect(verifyMonitorConsent(signed.token, binding, now).sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([
    "actorId",
    "projectId",
    "monitorId",
    "revisionId",
    "scheduleIntentId",
    "connectionId",
    "connectionStamp",
    "idempotencyKey",
  ] as const)("rejects a changed %s", (field) => {
    const signed = signMonitorConsent(binding, now);
    expect(() => verifyMonitorConsent(signed.token, { ...binding, [field]: "other" }, now)).toThrow(
      "mismatch",
    );
  });
  it("rejects changed membership, native price, monitor version and quote policy", () => {
    const signed = signMonitorConsent(binding, now);
    for (const next of [
      { ...binding, targetIds: ["a"] },
      { ...binding, monitorVersion: 3 },
      {
        ...binding,
        quote: {
          ...binding.quote,
          nativeEstimates: [{ unit: "USD", amount: "0.0013" }],
        },
      },
      {
        ...binding,
        quote: {
          ...binding.quote,
          effectiveOptions: { surface: "local_finder" },
        },
      },
    ])
      expect(() => verifyMonitorConsent(signed.token, next, now)).toThrow("mismatch");
  });
  it("accepts membership ordering without broadening the signed set", () => {
    const signed = signMonitorConsent(binding, now);
    expect(() =>
      verifyMonitorConsent(
        signed.token,
        {
          ...binding,
          targetIds: ["b", "a"],
          quote: { ...binding.quote, expectedTargetKeys: ["key-b", "key-a"] },
        },
        now,
      ),
    ).not.toThrow();
  });
  it("rejects an invalid host clock", () => {
    expect(() => signMonitorConsent(binding, new Date(Number.NaN))).toThrow();
    expect(() =>
      verifyMonitorConsent(signMonitorConsent(binding, now).token, binding, new Date(Number.NaN)),
    ).toThrow();
  });
  it("rejects expiration at the exact quote boundary and tampered tokens", () => {
    const signed = signMonitorConsent(binding, now);
    expect(() =>
      verifyMonitorConsent(signed.token, binding, new Date(binding.quote.expiresAt)),
    ).toThrow("expired");
    expect(() => verifyMonitorConsent(`${signed.token}x`, binding, now)).toThrow("tampered");
  });
});
