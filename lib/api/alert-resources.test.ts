import type {
  AlertDeliveryAttemptView,
  AlertRuleView,
  TriggeredAlertView,
} from "@/lib/alerts/alert-data";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alertRuleApiResources, triggeredAlertApiResources } from "./alert-resources";

const mocks = vi.hoisted(() => ({
  prisma: {
    alertRule: { findMany: vi.fn() },
    keyword: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    triggeredAlert: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    webhookEndpoint: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rule = {
  channel: "Email",
  channels: ["email"],
  changePct: null,
  condition: "rank crosses below #10",
  conditionType: "threshold",
  competitorDomain: null,
  dropPositions: null,
  enabled: true,
  fires: "0 this week",
  id: "rule_db_1",
  name: "Rank drop",
  period: "Each check",
  recipientIds: ["user_db_1"],
  scope: "Selected keywords",
  serpFeature: null,
  severity: "urgent",
  status: "active",
  targetIds: ["keyword_db_1"],
  targetType: "keyword",
  thresholdPosition: 10,
  topN: null,
} as const satisfies AlertRuleView;

const alert: Omit<TriggeredAlertView, "deliveryAttempts"> & {
  deliveryAttempts: Array<AlertDeliveryAttemptView & { id: string }>;
} = {
  action: "Review the rank check.",
  ctas: ["Open keyword"],
  current: "#11",
  deliveryAttempts: [
    {
      channel: "webhook",
      error: null,
      id: "attempt_db_1",
      status: "sent",
      webhookEndpointId: "webhook_db_1",
      webhookEndpointLabel: "Alerts",
      when: "just now",
    },
  ],
  deliveryState: "delivered",
  headline: "Rank dropped",
  id: "alert_db_1",
  keyword: "rank tracker",
  previous: "#4",
  rule: "Rank drop",
  severity: "urgent",
  unread: true,
  when: "just now",
};

describe("REST alert resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      { id: "rule_db_1", publicId: "alr_a00000000000000000000000" },
    ]);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { id: "keyword_db_1", publicId: "kw_a00000000000000000000000" },
    ]);
    mocks.prisma.tag.findMany.mockResolvedValue([]);
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: "user_db_1", publicId: "usr_a00000000000000000000000" },
    ]);
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      { id: "alert_db_1", publicId: "al_a00000000000000000000000" },
    ]);
    mocks.prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: "webhook_db_1", publicId: "we_a00000000000000000000000" },
    ]);
  });

  it("replaces every addressable alert-rule ID with its v3 public identity", async () => {
    await expect(alertRuleApiResources([rule])).resolves.toMatchObject([
      {
        id: "alr_a00000000000000000000000",
        recipientIds: ["usr_a00000000000000000000000"],
        targetIds: ["kw_a00000000000000000000000"],
      },
    ]);
  });

  it("replaces alert and endpoint IDs and omits non-addressable attempt IDs", async () => {
    const [resource] = await triggeredAlertApiResources([alert]);

    expect(resource).toMatchObject({ id: "al_a00000000000000000000000" });
    expect(resource.deliveryAttempts).toEqual([
      expect.objectContaining({ webhookEndpointId: "we_a00000000000000000000000" }),
    ]);
    expect(resource.deliveryAttempts[0]).not.toHaveProperty("id");
  });
});
