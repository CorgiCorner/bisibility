import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  db: { triggeredAlert: { findFirst: vi.fn(), updateMany: vi.fn() } },
  notify: vi.fn(),
  outcomeState: vi.fn(() => "delivered"),
  reserve: vi.fn(),
  suppressed: vi.fn(),
  post: vi.fn(),
  email: vi.fn(),
  record: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/db/public-id", () => ({ isPublicIdOfType: () => true }));
vi.mock("@/lib/schemas/project", () => ({ trackedProjectDomain: (x: string) => x }));
vi.mock("@/lib/alerts/daily-cap", () => ({
  reserveDeliveryBudgetOnce: m.reserve,
  recordSuppressed: m.suppressed,
}));
vi.mock("@/lib/alerts/recipients", () => ({
  filterAlertEmailRecipients: vi.fn(),
  resolveAlertRuleRecipients: vi.fn(),
}));
vi.mock("@/lib/alerts/transitions", () => ({ deliverableAlertWhere: () => ({}) }));
vi.mock("@/lib/alerts/push-content", () => ({ alertPushMessage: vi.fn() }));
vi.mock("@/lib/temporal/alert-delivery-client", () => ({ startAlertDeliveryWorkflow: vi.fn() }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));
vi.mock("@/lib/ops/slack", () => ({ redactOpsText: String }));
vi.mock("@/lib/alerts/webhook-envelope", () => ({
  buildAlertDailyCapReachedWebhookBody: (x: unknown) => x,
}));
vi.mock("@/lib/alerts/delivery", () => ({
  postSignedBody: m.post,
  postSignedWebhook: vi.fn(),
  sendSlackMessage: vi.fn(),
  sendAlertEmail: m.email,
  recordDeliveryAttempt: m.record,
  sendSlackAlert: vi.fn(),
  stampWebhookDelivery: vi.fn(),
}));
vi.mock("@/lib/alerts/push-delivery", () => ({ deliverPushToProject: vi.fn() }));
vi.mock("@/lib/notifications/apns", () => ({ defaultPushSender: vi.fn() }));
vi.mock("@/lib/notifications/events", () => ({ notifyTriggeredAlertDelivered: m.notify }));
// Preserve the production error's retryability without requiring a Temporal server.
vi.mock("@/lib/temporal/delivery-failures", () => ({
  classifyDeliveryFailure: (e: unknown) => e,
  deliveryFailureMessage: (e: Error) => e.message,
  deliveryStateForOutcomes: m.outcomeState,
  nonRetryableFailure: (s: string) => new Error(s),
}));

import { reserveAlertDeliveryBudgetActivity } from "@/lib/temporal/alert-delivery-context";

beforeEach(() => {
  vi.clearAllMocks();
});

type Endpoint = { id: string; url: string; hmacSecret: string; enabled: boolean };

it.each([
  [[false], []],
  [[true], ["endpoint_0"]],
  [
    [false, true, false, true],
    ["endpoint_1", "endpoint_3"],
  ],
])("sends overflow only to enabled endpoints: %j", async (enabled, expected) => {
  const endpoints: Endpoint[] = enabled.map((value, index) => ({
    id: `endpoint_${index}`,
    url: `https://example.com/hook/${index}`,
    hmacSecret: "fixture",
    enabled: value,
  }));
  m.db.triggeredAlert.findFirst.mockImplementation(async (query) => {
    const where = query.select.keyword.select.project.select.webhookEndpoints.where;
    const selected =
      where?.enabled === true ? endpoints.filter((endpoint) => endpoint.enabled) : endpoints;
    return {
      keyword: {
        project: { id: "p1", publicId: "prj_1", slackConnection: null, webhookEndpoints: selected },
      },
      rule: { channels: ["webhook"], id: "r1", publicId: "alr_1", name: "Rule" },
    };
  });
  m.reserve.mockResolvedValue({ granted: false });
  m.db.triggeredAlert.updateMany.mockResolvedValue({ count: 1 });
  m.suppressed.mockResolvedValue({ overflowNoticeDue: true });
  m.post.mockResolvedValue({ status: 200 });
  await expect(
    reserveAlertDeliveryBudgetActivity({ alertId: "a1", deliveryClaimToken: "claim1" }),
  ).resolves.toEqual({ granted: false });
  expect(m.post.mock.calls.map(([endpoint]) => endpoint.id)).toEqual(expected);
  expect(m.suppressed).toHaveBeenCalledTimes(1);
});
