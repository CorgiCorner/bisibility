import { createModelUsageReceipt } from "@/lib/model-playground/usage";
import { binding } from "@/lib/model-playground/usage.test-support";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import routed from "./__fixtures__/routed.json";
import { key } from "./adapter.test-support";
import { textModelId } from "./catalog";
import { normalizeResponse } from "./normalize";
import { normalizeMoney } from "./usage";

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

function normalize(
  attempts: unknown,
  options: { finalProvider?: unknown } = { finalProvider: "bedrock" },
) {
  const body = structuredClone(routed);
  Object.assign(body.choices[0].message.provider_metadata.gateway.routing, {
    modelAttempts: attempts,
    finalProvider: options.finalProvider,
  });
  return normalizeResponse({ body, requestId: null }, textModelId, key);
}
function model(providerAttempts: unknown[], success = true) {
  return { canonicalSlug: textModelId, success, providerAttempts };
}
const system = { provider: "bedrock", success: true, credentialType: "system" };

it("retains every failed and successful attempt with enum-only credential provenance", () => {
  const value = normalize([
    model([{ ...system, success: false, credentialType: "byok", error: key }], false),
    model([system]),
  ]);
  expect(value.routingAttemptCredentials).toEqual({
    version: 1,
    completeness: "partial",
    attempts: [
      { outcome: "failed", credentialSource: "customer_upstream" },
      { outcome: "succeeded", credentialSource: "gateway_system" },
    ],
  });
  expect(JSON.stringify(value)).not.toContain(key);
});
it("keeps a missing final provider null without inventing a contradiction", () => {
  expect(normalize([model([system])], {})).toMatchObject({
    state: "completed",
    failure: null,
    actualProviderId: null,
    providerCost: { certainty: "reported" },
  });
});
it("rejects two successful providers inside one model attempt", () => {
  expect(normalize([model([system, system])])).toMatchObject({
    state: "partial",
    failure: "invalid_response",
    providerCost: { amount: null, certainty: "unknown" },
    routingAttemptCredentials: { completeness: "partial" },
  });
});
it.each([undefined, "unrecognized", key])(
  "preserves unknown credentials without provider text: %s",
  (credentialType) => {
    const value = normalize([model([{ ...system, credentialType }])]);
    expect(value.routingAttemptCredentials).toMatchObject({
      completeness: "partial",
      attempts: [{ outcome: "succeeded", credentialSource: "unknown" }],
    });
    expect(JSON.stringify(value)).not.toContain(key);
  },
);
it.each([undefined, null, {}, "attempts"])(
  "keeps missing or non-array routing coverage unknown: %j",
  (attempts) => {
    expect(normalize(attempts).routingAttemptCredentials).toEqual({
      version: 1,
      completeness: "unknown",
      attempts: [],
    });
  },
);
it("does not infer complete request coverage from a consistent system-only tree", () => {
  const value = normalize([model([system])]);
  expect(value.routingAttemptCredentials).toEqual({
    version: 1,
    completeness: "partial",
    attempts: [{ outcome: "succeeded", credentialSource: "gateway_system" }],
  });
  const b = binding();
  b.column.providerId = "vercel_ai_gateway";
  b.column.modelId = textModelId;
  const result = { ...transportEvidence(b.column, Date.now(), null), ...value };
  expect(createModelUsageReceipt(b, result).additionalExposure).toBe("unknown");
});
it.each(
  [
    [],
    [model([])],
    [model([{ ...system, success: undefined }])],
    [model([system]), {}],
    Array(101).fill(model([{ ...system, success: false }], false)),
  ].map((attempts) => ({ attempts })),
)(
  "never claims complete coverage of malformed, empty or oversized routing: $attempts",
  ({ attempts }) => {
    const value = normalize(attempts);
    expect(value.routingAttemptCredentials?.completeness).toBe("partial");
    expect(value.routingAttemptCredentials?.attempts.length ?? 0).toBeLessThanOrEqual(100);
  },
);

it("refuses a subtotal for two successful providers even without normalization", () => {
  const gateway = { cost: "0.1", routing: { modelAttempts: [model([system, system])] } };
  expect(normalizeMoney(gateway)).toMatchObject({ amount: null, certainty: "unknown" });
});
