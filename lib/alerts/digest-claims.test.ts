import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushAlertDigests, type PendingAlertDigestRecord } from "./digest";

const suffix = "a00000000000000000000000";

type MutableAlert = PendingAlertDigestRecord & {
  deliveryClaimToken: string | null;
};

const mocks = vi.hoisted(() => ({
  enqueueAlertDigestJob: vi.fn(),
  recordSuppressed: vi.fn(),
  reserveDeliveryBudgetOnce: vi.fn(),
  sendAlertOverflowNotice: vi.fn(),
  prisma: {
    alertRuleDailyStat: { findUnique: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    triggeredAlert: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/temporal/alert-delivery-client", () => ({
  enqueueAlertDigestJob: mocks.enqueueAlertDigestJob,
}));
vi.mock("./daily-cap", () => ({
  recordSuppressed: mocks.recordSuppressed,
  reserveDeliveryBudgetOnce: mocks.reserveDeliveryBudgetOnce,
  utcDay: (now: Date) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
}));
vi.mock("./overflow-notice", () => ({
  sendAlertOverflowNotice: mocks.sendAlertOverflowNotice,
}));

function alert(
  id: string,
  deliveryState: MutableAlert["deliveryState"],
  deliveryClaimedAt: Date | null = null,
  deliveryClaimToken: string | null = null,
): MutableAlert {
  return {
    afterPosition: 20,
    beforePosition: 1,
    createdAt: new Date("2026-07-21T10:00:00.000Z"),
    deliveredAt: null,
    deliveryClaimedAt,
    deliveryClaimToken,
    deliveryState,
    firedAt: new Date("2026-07-21T10:00:00.000Z"),
    id,
    publicId: `al_${suffix}`,
    keyword: { publicId: `kw_${suffix}`, text: id },
    keywordId: `keyword_${id}`,
    payload: { action: "Review it", headline: id },
    rankCheckId: `check_${id}`,
    resolvedAt: null,
    rule: {
      channels: ["email"],
      conditionType: "position_drop",
      createdBy: { email: "owner@example.com", id: "user_1" },
      id: "rule_1",
      name: "Ranking drops",
      publicId: `alr_${suffix}`,
      project: {
        domain: "example.com",
        id: "project_1",
        name: "Example",
        publicId: `prj_${suffix}`,
        slackConnection: null,
        webhookEndpoints: [],
      },
      recipients: [{ user: { email: "owner@example.com", id: "user_1" } }],
    },
    ruleId: "rule_1",
    snoozedUntil: null,
    status: "firing",
    updatedAt: new Date("2026-07-21T10:00:00.000Z"),
  } as unknown as MutableAlert;
}

describe("alert digest claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.alertRuleDailyStat.findUnique.mockResolvedValue({ suppressedCount: 0 });
    mocks.prisma.notificationPreference.findMany.mockResolvedValue([]);
    mocks.reserveDeliveryBudgetOnce.mockResolvedValue({ granted: true, reused: false });
  });

  it("rollback releases only rows claimed by this flush", async () => {
    const rows = [alert("alert_1", "digest_pending"), alert("alert_2", "digest_pending")];
    let ownToken: string | null = null;
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue(rows);
    mocks.prisma.triggeredAlert.updateMany.mockImplementation((input) => {
      const ids = (input.where?.id?.in ?? []) as string[];
      if (input.data.deliveryState === "digesting") {
        ownToken = input.data.deliveryClaimToken;
      }
      for (const row of rows) {
        const tokenMatches =
          input.where?.deliveryClaimToken === undefined ||
          row.deliveryClaimToken === input.where.deliveryClaimToken;
        if (ids.includes(row.id) && tokenMatches) {
          row.deliveryState = input.data.deliveryState;
          row.deliveryClaimToken = input.data.deliveryClaimToken ?? row.deliveryClaimToken;
        }
      }
      return Promise.resolve({ count: ids.length });
    });
    mocks.enqueueAlertDigestJob.mockImplementation(async () => {
      rows[1].deliveryClaimToken = "other-token";
      throw new Error("queue unavailable");
    });

    await flushAlertDigests(new Date("2026-07-21T11:00:00.000Z"));

    expect(ownToken).toEqual(expect.any(String));
    expect(rows[0].deliveryState).toBe("digest_pending");
    expect(rows[1]).toMatchObject({
      deliveryClaimToken: "other-token",
      deliveryState: "digesting",
    });
  });

  it("stale digesting claims are recovered, fresh ones are not", async () => {
    const stale = alert("alert_stale", "digesting", new Date("2026-07-21T10:29:00.000Z"), "old");
    const fresh = alert("alert_fresh", "digesting", new Date("2026-07-21T10:59:00.000Z"), "fresh");
    const rows = [stale, fresh];
    mocks.prisma.triggeredAlert.findMany.mockImplementation(() =>
      Promise.resolve(rows.filter((row) => row.deliveryState === "digest_pending")),
    );
    mocks.prisma.triggeredAlert.updateMany.mockImplementation((input) => {
      if (input.where?.deliveryClaimedAt?.lt) {
        stale.deliveryState = "digest_pending";
        stale.deliveryClaimToken = null;
        stale.deliveryClaimedAt = null;
        return Promise.resolve({ count: 1 });
      }
      const ids = (input.where?.id?.in ?? []) as string[];
      for (const row of rows) {
        if (ids.includes(row.id)) row.deliveryState = input.data.deliveryState;
      }
      return Promise.resolve({ count: ids.length });
    });
    mocks.enqueueAlertDigestJob.mockResolvedValue(undefined);

    await flushAlertDigests(new Date("2026-07-21T11:00:00.000Z"));

    expect(mocks.enqueueAlertDigestJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertIds: ["alert_stale"] }),
    );
    expect(fresh).toMatchObject({
      deliveryClaimToken: "fresh",
      deliveryState: "digesting",
    });
  });
});
