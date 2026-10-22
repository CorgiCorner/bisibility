import type { PaidCallPayment } from "@/lib/action-payment/paid-call";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { beforeEach, expect, it, vi } from "vitest";
import { providerFailurePhase } from "./failure-phase";
import { runDeploymentPaidCall } from "./paid-call-deployment";

const mocks = vi.hoisted(() => ({ start: vi.fn(), rate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/execution-extension", () => ({ startDeploymentExecution: mocks.start }));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: mocks.rate }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rate.mockResolvedValue({ success: true });
});
it("retains payment evidence even if final settlement fails after a provider response", async () => {
  const failure = new Error("settlement unavailable");
  const finish = vi.fn().mockRejectedValue(failure);
  const record = vi.fn().mockResolvedValue(undefined);
  mocks.start.mockResolvedValue({ credentials: {}, started: true, costCents: 2, finish });
  const payment: PaidCallPayment = {
    operationKey: "accepted-operation",
    snapshot: { credentialSource: "hosted", credentialsEncrypted: null },
    guard: { lockBusiness: async () => {}, assertRequest: async () => {} },
    record,
  };
  await expect(
    runDeploymentPaidCall({
      attribution: { context: { projectId: "project" } } as ProviderRequestAttribution,
      call: vi.fn().mockResolvedValue({ costCents: 2 }),
      connectionId: "connection",
      estimatedCostCents: 2,
      estimatedQuantity: 1,
      provider: "future",
      payment,
    }),
  ).rejects.toBe(failure);
  expect(record).toHaveBeenCalledExactlyOnceWith({ operationKey: "accepted-operation" });
  expect(finish).toHaveBeenCalledOnce();
});

it("marks admission exceptions before dispatch and preserves their identity and payment behavior", async () => {
  const failure = new TypeError("private admission detail");
  mocks.start.mockRejectedValueOnce(failure);
  const call = vi.fn();
  await expect(
    runDeploymentPaidCall({
      attribution: { context: { projectId: "project" } } as ProviderRequestAttribution,
      call,
      connectionId: "connection",
      estimatedCostCents: 2,
      estimatedQuantity: 1,
      provider: "future",
    }),
  ).rejects.toBe(failure);
  expect(providerFailurePhase(failure)).toBe("before_dispatch");
  expect(call).not.toHaveBeenCalled();
});

it("marks invalid estimates before starting admission or dispatch", async () => {
  const call = vi.fn();
  const error = await runDeploymentPaidCall({
    attribution: { context: { projectId: "project" } } as ProviderRequestAttribution,
    call,
    connectionId: "connection",
    estimatedCostCents: Number.NaN,
    estimatedQuantity: 1,
    provider: "future",
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(RangeError);
  expect(providerFailurePhase(error)).toBe("before_dispatch");
  expect(mocks.start).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});
