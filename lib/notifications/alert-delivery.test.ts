import type { AlertExternalDeliveryPayload } from "@/lib/alerts/alert-delivery-payload";
import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
import { notifyTriggeredAlertsDelivered } from "./alert-delivery";
import { notificationTransaction } from "./transaction";

const mocks = vi.hoisted(() => ({ receipt: vi.fn(), publish: vi.fn(async () => {}) }));
vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: mocks.receipt }));
vi.mock("./realtime", () => ({ publishNotificationCreated: mocks.publish }));

const payload: AlertExternalDeliveryPayload = {
  action: "Review ranking",
  afterPosition: 3,
  beforePosition: 5,
  alertId: "al_1",
  conditionType: "position",
  firedAt: "2026-11-05T00:00:00Z",
  headline: "Ranking changed",
  keyword: "rank tracker",
  keywordId: "kw_1",
  projectDomain: "example.com",
  projectId: "prj_1",
  ruleId: "ar_1",
  ruleName: "Ranking",
};
beforeEach(() => vi.clearAllMocks());

it.each(["commit", "rollback", "replay", "test"])(
  "batched alert receipts follow durable %s outcomes",
  async (mode) => {
    const create = vi.fn(async ({ data }) =>
      mode === "replay"
        ? []
        : data.map((row: object) => ({
            ...row,
            id: "n1",
            createdAt: new Date("2026-11-05T00:00:00Z"),
          })),
    );
    const tx = {
      project: { findUnique: async () => ({ publicId: "prj_1", ownerId: "u1", members: [] }) },
      notificationPreference: { findMany: async () => [] },
      notification: { createManyAndReturn: create },
    } as unknown as Prisma.TransactionClient;
    const database = {
      async $transaction<T>(persist: (client: Prisma.TransactionClient) => Promise<T>) {
        const result = await persist(tx);
        expect(mocks.receipt).not.toHaveBeenCalled();
        if (mode === "rollback") throw new Error("commit rejected");
        return result;
      },
    };
    const run = notificationTransaction(
      async (client) => {
        await notifyTriggeredAlertsDelivered(
          "p1",
          [
            {
              triggeredAlertId: "a1",
              payload: { ...payload, test: mode === "test" },
            },
          ],
          client,
        );
      },
      undefined,
      database,
    );
    if (mode === "rollback") await expect(run).rejects.toThrow("commit rejected");
    else await run;
    if (mode === "commit" || mode === "test") {
      expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith({
        userId: "u1",
        surface: "alert",
        nonEmpty: mode === "commit",
      });
    } else expect(mocks.receipt).not.toHaveBeenCalled();
  },
);
