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
    projectMarket: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    triggeredAlert: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    webhookEndpoint: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rule = {
  channels: ["email"],
  changePct: null,
  conditionType: "threshold",
  competitorDomain: null,
  dropPositions: null,
  enabled: true,
  firedThisWeek: 0,
  id: "rule_db_1",
  marketIds: [],
  name: "Rank drop",
  period: "each_check",
  recipientIds: ["user_db_1"],
  scope: { labels: [], targetType: "keyword" },
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
  location: "United States",
  device: "desktop",
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
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);
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

  it("keeps the established alert-rule REST fields separate from localized UI inputs", async () => {
    const [resource] = await alertRuleApiResources([rule]);

    expect(resource).toMatchObject({
      channel: "Email",
      condition: "rank crosses below #10",
      fires: "0 this week",
      period: "Each check",
      scope: "Selected keywords",
    });
    expect(resource).not.toHaveProperty("firedThisWeek");
    expect(resource).not.toHaveProperty("marketScope");
  });

  it("replaces alert and endpoint IDs and omits non-addressable attempt IDs", async () => {
    const [resource] = await triggeredAlertApiResources([alert]);

    expect(resource).toMatchObject({ id: "al_a00000000000000000000000" });
    expect(resource.deliveryAttempts).toEqual([
      expect.objectContaining({ webhookEndpointId: "we_a00000000000000000000000" }),
    ]);
    expect(resource.deliveryAttempts[0]).not.toHaveProperty("id");
    expect(resource).not.toHaveProperty("location");
    expect(resource).not.toHaveProperty("device");
  });
});
