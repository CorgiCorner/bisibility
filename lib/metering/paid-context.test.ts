import type { Prisma } from "@/lib/generated/prisma/client";
import type { ReserveInput } from "@usagekit/core";
import { expect, test, vi } from "vitest";
import type { PaidAttemptContext } from "./paid-attempt-types";
import { retainPaidContext } from "./paid-context";

const context: PaidAttemptContext = {
  projectId: "project",
  connectionId: "connection",
  publicConnectionId: "public",
  providerCredentialVersion: "version",
  correlationId: "correlation",
  tag: "original",
};
const request = {
  operationId: "attempt",
  scope: { namespace: "test", principal: "owner", connection: "connection" },
  fundingSource: "byok",
  costOwner: "owner",
  surface: "app",
  source: "app",
  provider: "dataforseo",
  operation: "rank_check",
  estimate: [],
} satisfies ReserveInput;
function transaction(stored: PaidAttemptContext & { chargeReplayed?: boolean }) {
  const query = vi.fn().mockResolvedValue([{ principal: "owner", context: stored }]);
  const execute = vi.fn();
  return {
    tx: { $queryRaw: query, $executeRaw: execute } as unknown as Prisma.TransactionClient,
    execute,
  };
}

test.each([false, true])(
  "reservation replay accepts settlement chargeReplayed=%s",
  async (chargeReplayed) => {
    const { tx, execute } = transaction({ ...context, chargeReplayed });
    await expect(retainPaidContext(tx, request, context, true)).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  },
);

test.each(["tag", "correlationId", "providerCredentialVersion"] as const)(
  "settlement metadata never hides a changed %s",
  async (field) => {
    const { tx } = transaction({ ...context, chargeReplayed: false });
    await expect(
      retainPaidContext(tx, request, { ...context, [field]: "changed" }, true),
    ).rejects.toThrow("Paid attempt context conflict");
  },
);

test("only the charge replay flag is excluded from context identity", async () => {
  const stored = { ...context, chargeReplayed: false, unexpectedMetadata: true };
  const { tx } = transaction(stored);
  await expect(retainPaidContext(tx, request, context, true)).rejects.toThrow(
    "Paid attempt context conflict",
  );
});

test("retained pricing options and business feature cannot change on replay", async () => {
  const requestPricing = {
    version: 1 as const,
    provider: "dataforseo",
    operation: "serp.google.organic.live.advanced",
    options: { depth: "100" },
  };
  const original: PaidAttemptContext = { ...context, feature: "rank_check", requestPricing };
  const { tx } = transaction(original);
  await expect(retainPaidContext(tx, request, original, true)).resolves.toBeUndefined();
  await expect(
    retainPaidContext(tx, request, { ...original, feature: "keyword_research" }, true),
  ).rejects.toThrow("Paid attempt context conflict");
  await expect(
    retainPaidContext(
      tx,
      request,
      { ...original, requestPricing: { ...requestPricing, options: { depth: "10" } } },
      true,
    ),
  ).rejects.toThrow("Paid attempt context conflict");
});
