import { beforeEach, expect, it, vi } from "vitest";
import type { TriggeredAlertDeliveryPayload } from "./alert-delivery-payload";

const mocks = vi.hoisted(() => ({ receipt: vi.fn(), find: vi.fn(), deliver: vi.fn() }));
vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: mocks.receipt }));
vi.mock("./prepared-email-store", () => ({ prismaPreparedEmailStore: { find: mocks.find } }));
vi.mock("./prepared-email-delivery", async (original) => ({
  ...(await original<typeof import("./prepared-email-delivery")>()),
  deliverPreparedEmail: mocks.deliver,
}));
vi.mock("./send-gate", async (original) => ({
  ...(await original<typeof import("./send-gate")>()),
  resolveAlertEmailIds: async () => ({}),
  alertEmailSendGate: async () => ({ allowed: true, userId: "person", projectId: "project" }),
  requireAlertEmailSend: async () => ({ email: "person@example.test" }),
}));
vi.mock("@/lib/email/registry", () => ({ resolveEmailProvider: () => null }));

import { deliverAlertEmailActivity } from "./alert-email-activity";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue(null);
  mocks.deliver.mockResolvedValue({ delivered: true });
});

it.each([
  [true, false, false, 3, true],
  [false, false, false, 3, false],
  [true, true, false, 3, false],
  [true, false, true, 3, false],
  [true, false, false, null, false],
])(
  "records actual, new, non-test alert result delivery %j",
  async (delivered, accepted, test, position, expected) => {
    mocks.deliver.mockResolvedValue({ delivered });
    mocks.find.mockResolvedValue(accepted ? { state: "accepted" } : null);
    await deliverAlertEmailActivity({
      alertId: "alert",
      recipientEmail: "person@example.test",
      payload: {
        test,
        afterPosition: position,
        beforePosition: null,
      } as TriggeredAlertDeliveryPayload,
    });
    expect(mocks.receipt).toHaveBeenCalledWith({
      userId: "person",
      surface: "alert",
      nonEmpty: expected,
    });
  },
);
