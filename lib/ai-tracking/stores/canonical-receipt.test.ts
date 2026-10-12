import { Prisma } from "@/lib/generated/prisma/client";
import { expect, test, vi } from "vitest";
import { requireResolvedGenerations, validateReceipt } from "./generation-validation";
import type { TrackingTransaction } from "./shared";

const read = vi.hoisted(() => vi.fn());
const usage = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/lib/metering/usage-read", () => ({ canonicalReceipt: read, readCanonicalUsage: usage }));
vi.mock("./generation-reconciliation", () => ({ reconcileProjectGenerations: vi.fn() }));
test("versioned AI references validate canonical costs and reject other namespaces", async () => {
  vi.stubEnv("METERING_NAMESPACE", "test");
  read.mockResolvedValue({
    measurementStatus: "recorded",
    costCents: new Prisma.Decimal(100),
    providerCredentialVersion: "version",
  });
  const receipt = {
    providerCostEntryId: null,
    operationRef: { version: 1 as const, namespace: "test", operationId: "op" },
    connectionId: "connection",
    credentialVersion: "version",
    amountUsd: "9",
    state: "confirmed" as const,
    providerRequestId: null,
  };
  const tx = {} as TrackingTransaction;
  await expect(validateReceipt(tx, "project", "connection", receipt)).rejects.toThrow(
    "cost conflicts",
  );
});
test("AI references reject other namespaces", async () => {
  vi.stubEnv("METERING_NAMESPACE", "test");
  const tx = {} as TrackingTransaction;
  const receipt = {
    providerCostEntryId: null,
    operationRef: { version: 1 as const, namespace: "test", operationId: "op" },
    connectionId: "connection",
    credentialVersion: "version",
    amountUsd: "9",
    state: "confirmed" as const,
    providerRequestId: null,
  };
  await expect(
    validateReceipt(tx, "project", "connection", {
      ...receipt,
      amountUsd: "1",
      operationRef: { ...receipt.operationRef, namespace: "another" },
    }),
  ).rejects.toThrow("namespace");
  vi.unstubAllEnvs();
});
test("canonical AI evidence must retain the credential version used at consent", async () => {
  vi.stubEnv("METERING_NAMESPACE", "test");
  read.mockResolvedValue({
    measurementStatus: "recorded",
    costCents: new Prisma.Decimal(100),
    providerCredentialVersion: "different-version",
  });
  await expect(
    validateReceipt({} as TrackingTransaction, "project", "connection", {
      providerCostEntryId: "op",
      connectionId: "connection",
      credentialVersion: "consented-version",
      amountUsd: "1",
      state: "confirmed",
    }),
  ).rejects.toThrow("credential version");
  vi.unstubAllEnvs();
});
test("historical IDs normalize to the actual namespaced operation reference", async () => {
  vi.stubEnv("METERING_NAMESPACE", "test");
  read.mockResolvedValue({
    id: "legacy:op",
    namespace: "test",
    providerCredentialVersion: "version",
    measurementStatus: "unknown",
    costCents: null,
  });
  expect(
    await validateReceipt({} as TrackingTransaction, "project", "connection", {
      providerCostEntryId: "op",
      connectionId: "connection",
      credentialVersion: "version",
      amountUsd: null,
      state: "unknown",
    }),
  ).toEqual({ version: 1, namespace: "test", operationId: "legacy:op" });
  vi.unstubAllEnvs();
});

test("known business completion does not bypass unknown canonical paid history", async () => {
  usage.mockResolvedValue([{ measurementStatus: "unknown" }]);
  const tx = {
    aiTrackingSuggestionGeneration: { findFirst: async () => null },
  } as unknown as TrackingTransaction;
  await expect(requireResolvedGenerations(tx, "project")).rejects.toMatchObject({
    reason: "usage_reconciliation_required",
  });
  usage.mockResolvedValue([]);
});
