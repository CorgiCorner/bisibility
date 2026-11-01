import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  ProviderRecoveryAdmissionError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";
import { expect, it, vi } from "vitest";
import { recordRankRefusals } from "./refusal-journal";

const input = {
  connectionId: "connection",
  credentialVersion: "version",
  checks: [{ rankCheckId: "check" }],
  refusal: new ProviderRecoveryAdmissionError("accounting_review", { kind: "account" }),
};

it("retries only the rolled-back persistence transaction", async () => {
  const createMany = vi.fn();
  const tx = {
    rankCheckRunItem: { findMany: vi.fn().mockResolvedValue([]) },
    providerBlockedAttempt: { createMany },
  };
  const transaction = vi
    .fn()
    .mockRejectedValueOnce(new Error("retry 1"))
    .mockRejectedValueOnce(new Error("retry 2"))
    .mockImplementation(async (work) => work(tx));
  await recordRankRefusals({ $transaction: transaction } as unknown as PrismaClient, input);
  expect(transaction).toHaveBeenCalledTimes(3);
  expect(createMany).toHaveBeenCalledOnce();
});

it("fails closed after persistence retries are exhausted", async () => {
  const transaction = vi.fn().mockRejectedValue(new Error("unavailable"));
  await expect(
    recordRankRefusals({ $transaction: transaction } as unknown as PrismaClient, input),
  ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
  expect(transaction).toHaveBeenCalledTimes(3);
});
