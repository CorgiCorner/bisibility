import type { Prisma } from "@/lib/generated/prisma/client";
import type { PaidContextRow } from "@/lib/metering/paid-context";
import { paidContext } from "@/lib/metering/paid-context";
import type { Operation } from "@usagekit/core";
import { beforeEach, expect, it, vi } from "vitest";
import { retainRankDispatchIdentity } from "./dispatch-identity";

vi.mock("@/lib/metering/paid-context", () => ({ paidContext: vi.fn() }));
const tx = {} as Prisma.TransactionClient;
const operation = {
  provider: "dataforseo",
  operation: "rank_check",
  operationId: "original",
  scope: { namespace: "original", principal: "owner" },
} as Operation;
const context = {
  projectId: "project",
  connectionId: "connection",
  publicConnectionId: "conn_public",
  correlationId: "comparison:side",
  providerCredentialVersion: "original-version",
};
beforeEach(() => vi.clearAllMocks());
function retained(extra: Record<string, string> = {}) {
  vi.mocked(paidContext).mockResolvedValue({ context: { ...context, ...extra } } as PaidContextRow);
}

it("leaves other providers untouched", async () => {
  await retainRankDispatchIdentity(tx, { ...operation, provider: "serpapi" });
  expect(paidContext).not.toHaveBeenCalled();
});
it("leaves other paid features untouched", async () => {
  retained({ feature: "ai_tracking" });
  await retainRankDispatchIdentity(tx, operation, {
    method: "POST",
    url: "https://fixture.invalid",
  });
});
it("leaves comparison targets without a rank check untouched", async () => {
  retained();
  await retainRankDispatchIdentity(tx, operation, {
    method: "POST",
    url: "https://fixture.invalid",
  });
});
it("refuses a linked rank check without its canonical request before intent", async () => {
  retained({ rankCheckId: "check", keywordId: "keyword" });
  await expect(retainRankDispatchIdentity(tx, operation)).rejects.toThrow(
    "identity is unavailable",
  );
});

it.each([undefined, null, "", "   ", 42])(
  "refuses a new live identity with invalid tag %s before any identity write",
  async (tag) => {
    retained({ rankCheckId: "check", keywordId: "keyword" });
    await expect(
      retainRankDispatchIdentity(tx, operation, {
        method: "POST",
        url: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
        body: [{ keyword: "original", ...(tag === undefined ? {} : { tag }) }],
      }),
    ).rejects.toThrow("Live rank dispatch requires its native tag");
  },
);
