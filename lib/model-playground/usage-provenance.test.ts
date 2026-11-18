import { expect, it } from "vitest";
import { routingCredentials } from "./attempt-provenance.test-support";
import { createModelUsageReceipt, projectModelUsage, validateModelUsageReceipt } from "./usage";
import { binding, reportedResult } from "./usage.test-support";
import { type ModelUsageBinding, modelNativeUsageReceiptSchema } from "./usage-contract";
import {
  bindModelUsageEvidence,
  loadModelUsageEvidence,
  persistModelUsageEvidence,
} from "./usage-storage";
import { usageStorageHarness } from "./usage-storage.test-support";

function gatewayBinding(): ModelUsageBinding {
  const value = binding();
  value.column.providerId = "vercel_ai_gateway";
  return value;
}
function gatewayResult() {
  // Synthetic contract evidence, independent of any adapter's coverage guarantee.
  const value = reportedResult();
  value.column = gatewayBinding().column;
  return { ...value, routingAttemptCredentials: routingCredentials() };
}
it("reconciles complete system-only provenance independently from cost certainty", () => {
  const b = gatewayBinding();
  const value = gatewayResult();
  const receipt = createModelUsageReceipt(b, value);
  expect(receipt.version).toBe("model-native-v2");
  expect(receipt.additionalExposure).toBe("none_reported");
  expect(receipt.monetary.status).toBe("reported");
  expect(receipt.evidence?.routingAttemptCredentials).toEqual(value.routingAttemptCredentials);
  expect(
    projectModelUsage(receipt, b.projectId, { counted: true, canonicalId: null })
      .reconciliationRequired,
  ).toBe(false);
});
it.each([
  { completeness: "complete", attempts: [{ outcome: "succeeded", credentialSource: "unknown" }] },
  { completeness: "partial", attempts: routingCredentials().attempts },
  { completeness: "unknown", attempts: [] },
  {
    completeness: "complete",
    attempts: [
      { outcome: "failed", credentialSource: "customer_upstream" },
      ...routingCredentials().attempts,
    ],
  },
])("keeps additional exposure unknown for %j", (provenance) => {
  const receipt = createModelUsageReceipt(gatewayBinding(), {
    ...gatewayResult(),
    routingAttemptCredentials: { version: 1, ...provenance },
  } as never);
  expect(receipt.additionalExposure).toBe("unknown");
  expect(receipt.monetary.total).toBeNull();
});
it.each(["openai", "anthropic", "openrouter", "vercel_ai_gateway"] as const)(
  "preserves absent-provenance behavior for %s",
  (providerId) => {
    const b = binding();
    b.column.providerId = providerId;
    const value = reportedResult();
    value.column = b.column;
    const receipt = createModelUsageReceipt(b, value);
    expect(receipt.additionalExposure).toBe(
      providerId === "vercel_ai_gateway" ? "unknown" : "none_reported",
    );
    expect(receipt.monetary.status).toBe(
      providerId === "vercel_ai_gateway" ? "unavailable" : "reported",
    );
    expect(receipt.evidence).not.toHaveProperty("routingAttemptCredentials");
  },
);
it("validates retained v1 evidence without upgrading its derivation", () => {
  const b = gatewayBinding();
  const value = gatewayResult();
  const { routingAttemptCredentials: _ignored, ...legacy } = value;
  const old = { ...createModelUsageReceipt(b, legacy), version: "model-native-v1" };
  expect(validateModelUsageReceipt(old, b)).toEqual(old);
  expect(
    modelNativeUsageReceiptSchema.safeParse({
      ...old,
      evidence: { ...old.evidence, routingAttemptCredentials: routingCredentials() },
    }).success,
  ).toBe(false);
  expect(
    modelNativeUsageReceiptSchema.safeParse({ ...old, version: "model-native-v3" }).success,
  ).toBe(false);
});
const { db, tx, seed } = usageStorageHarness();
it("loads old stored receipts and keeps their replay idempotent", async () => {
  const b = binding();
  const value = reportedResult();
  const old = { ...createModelUsageReceipt(b, value), version: "model-native-v1" };
  await db.query(
    'UPDATE metering_usage_evidence SET receipt=$1::jsonb,"providerRequestId"=$2 WHERE id=$3',
    [JSON.stringify(old), value.providerRequestId, b.attemptId],
  );
  expect((await loadModelUsageEvidence(tx, b.attemptId, b.projectId))?.receipt).toEqual(old);
  expect((await persistModelUsageEvidence(tx, b.attemptId, value)).changed).toBe(false);
});
it("pins a stored v1 gateway receipt when replay adds complete system-only provenance", async () => {
  const b = gatewayBinding();
  b.attemptId = "legacy-gateway-attempt";
  await seed(b.attemptId, { provider: b.column.providerId });
  const value = gatewayResult();
  const old = createModelUsageReceipt(b, value, "model-native-v1");
  await db.query(
    'UPDATE metering_usage_evidence SET receipt=$1::jsonb,"providerRequestId"=$2 WHERE id=$3',
    [JSON.stringify(old), value.providerRequestId, b.attemptId],
  );
  const replay = await persistModelUsageEvidence(tx, b.attemptId, value);
  expect(replay.changed).toBe(false);
  expect(replay.receipt).toEqual(old);
  const stored = (await loadModelUsageEvidence(tx, b.attemptId, b.projectId))?.receipt;
  expect(stored).toEqual(old);
  expect(stored?.version).toBe("model-native-v1");
  expect(stored?.additionalExposure).toBe("unknown");
  expect(stored?.evidence).not.toHaveProperty("routingAttemptCredentials");
});
it("persists and reads the new provenance and discard reason in native evidence", async () => {
  const b = gatewayBinding();
  b.attemptId = "gateway-attempt";
  await seed(b.attemptId, { provider: b.column.providerId });
  const value = gatewayResult();
  value.costEvidence.upstreamInferenceDiscardReason = "inconsistent";
  await bindModelUsageEvidence(tx, b.attemptId, b);
  await persistModelUsageEvidence(tx, b.attemptId, value);
  const stored = (await loadModelUsageEvidence(tx, b.attemptId, b.projectId))?.receipt;
  expect(stored?.additionalExposure).toBe("none_reported");
  expect(stored?.evidence?.routingAttemptCredentials).toEqual(value.routingAttemptCredentials);
  expect(stored?.evidence?.costEvidence?.upstreamInferenceDiscardReason).toBe("inconsistent");
});

it("a complete system list does not fabricate total cost or complete partial usage", () => {
  const value = gatewayResult();
  const reported = value.costEvidence.providerReported;
  if (!reported) throw new Error("Missing test reported total");
  reported.scope.kind = "subtotal";
  const receipt = createModelUsageReceipt(gatewayBinding(), value);
  expect(receipt.additionalExposure).toBe("none_reported");
  expect(receipt.monetary.total).toBeNull();
  value.usage.completeness = "partial";
  const partial = createModelUsageReceipt(gatewayBinding(), value);
  expect(partial.usageStatus).toBe("partial");
  expect(
    projectModelUsage(partial, partial.binding.projectId, { counted: true, canonicalId: null })
      .reconciliationRequired,
  ).toBe(true);
});
