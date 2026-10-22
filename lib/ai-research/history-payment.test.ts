import { beforeEach, expect, it, vi } from "vitest";
import { aiHistoryPayments } from "./history-payment";

const rows = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { agentReport: { findMany: rows } } }));
beforeEach(() => vi.clearAllMocks());
const receipt = {
  actionId: "action",
  quoteId: "action",
  state: "settled",
  option: {
    id: "option",
    connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
    providerId: "future-ai",
    providerLabel: "Future AI",
    fundingSource: "byok",
    payableUnit: { kind: "currency", code: "USD" },
  },
  charge: { value: "0.012345", unit: { kind: "currency", code: "USD" }, certainty: "measured" },
};
it("projects only validated retained receipts without rebuilding historical payer from current settings", async () => {
  rows.mockResolvedValue([
    { publicId: "agr_valid", body: { originalPayment: receipt } },
    { publicId: "agr_legacy", body: { result: { costCents: 99 } } },
    {
      publicId: "agr_untrusted",
      body: { originalPayment: { ...receipt, quoteToken: "not-a-receipt" } },
    },
  ]);
  const history = await aiHistoryPayments("project", ["agr_valid", "agr_legacy", "agr_untrusted"]);
  expect(history.get("agr_valid")).toEqual(receipt);
  expect(history.has("agr_legacy")).toBe(false);
  expect(history.has("agr_untrusted")).toBe(false);
  expect(rows).toHaveBeenCalledWith({
    where: { projectId: "project", publicId: { in: ["agr_valid", "agr_legacy", "agr_untrusted"] } },
    select: { publicId: true, body: true },
  });
});
it("does not query empty history", async () => {
  expect((await aiHistoryPayments("project", [])).size).toBe(0);
  expect(rows).not.toHaveBeenCalled();
});
