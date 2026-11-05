import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertRankSnapshot } from "./evaluate";
import {
  clearedIncidentWhere,
  createTriggeredAlertOnce,
  newerResolvedIncidentWhere,
  resolveClearedTriggeredAlerts,
  statefulStateKnown,
} from "./transitions";

const mocks = vi.hoisted(() => ({
  prisma: {
    triggeredAlert: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const alertData = {
  keywordId: "keyword_1",
  rankCheckId: "check_1",
  ruleId: "rule_1",
};

function snap(extra: Partial<AlertRankSnapshot> = {}): AlertRankSnapshot {
  return { position: 5, ...extra };
}

describe("createTriggeredAlertOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the created alert when no conflict occurs", async () => {
    const created = { id: "alert_1" };
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue(null);
    mocks.prisma.triggeredAlert.create.mockResolvedValue(created);

    await expect(createTriggeredAlertOnce(alertData)).resolves.toBe(created);
    expect(mocks.prisma.triggeredAlert.findFirst).toHaveBeenCalledWith({
      where: {
        keywordId: "keyword_1",
        rankCheckId: "check_1",
        ruleId: "rule_1",
      },
    });
    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledOnce();
  });

  it("returns null before insert when the same check already has an alert", async () => {
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue({ id: "alert_existing" });

    await expect(createTriggeredAlertOnce(alertData)).resolves.toBeNull();
    expect(mocks.prisma.triggeredAlert.create).not.toHaveBeenCalled();
  });

  it("treats a lost unique race as already processed", async () => {
    mocks.prisma.triggeredAlert.create.mockRejectedValue(new Error("unique constraint"));
    mocks.prisma.triggeredAlert.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "alert_existing" });

    await expect(createTriggeredAlertOnce(alertData)).resolves.toBeNull();
    expect(mocks.prisma.triggeredAlert.findFirst).toHaveBeenCalledWith({
      where: {
        keywordId: "keyword_1",
        rankCheckId: "check_1",
        ruleId: "rule_1",
      },
    });
  });

  it("rethrows when the re-read finds nothing", async () => {
    const error = new Error("database unavailable");
    mocks.prisma.triggeredAlert.create.mockRejectedValue(error);
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue(null);

    await expect(createTriggeredAlertOnce(alertData)).rejects.toBe(error);
  });

  it("rethrows without a re-read when rankCheckId is null", async () => {
    const error = new Error("database unavailable");
    mocks.prisma.triggeredAlert.create.mockRejectedValue(error);

    await expect(createTriggeredAlertOnce({ ...alertData, rankCheckId: null })).rejects.toBe(error);
    expect(mocks.prisma.triggeredAlert.findFirst).not.toHaveBeenCalled();
  });

  it("rethrows an insert failure inside a transaction without querying it", async () => {
    const error = new Error("public id collision");
    const aborted = new Error("current transaction is aborted");
    const tx = {
      triggeredAlert: {
        create: vi.fn().mockRejectedValue(error),
        findFirst: vi.fn().mockResolvedValueOnce(null).mockRejectedValue(aborted),
      },
    };

    await expect(createTriggeredAlertOnce(alertData, tx as never)).rejects.toBe(error);
    expect(tx.triggeredAlert.findFirst).toHaveBeenCalledOnce();
  });
});

describe("stateful alert transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("limits a clear to incidents older than the clearing check", () => {
    const checkedAt = new Date("2026-11-01T10:00:00.000Z");
    expect(clearedIncidentWhere("keyword_1", "rule_1", checkedAt)).toEqual({
      OR: [
        { rankCheck: { is: { checkedAt: { lt: checkedAt } } } },
        { firedAt: { lt: checkedAt }, rankCheckId: null },
      ],
      keywordId: "keyword_1",
      ruleId: "rule_1",
      status: { not: "resolved" },
    });
  });

  it("records the clearing check time when a stateful incident resolves", async () => {
    const now = new Date("2026-11-03T18:00:00.000Z");
    const checkedAt = new Date("2026-11-01T14:00:00.000Z");
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 1 });

    await resolveClearedTriggeredAlerts("keyword_1", "rule_1", now, { checkedAt });

    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: { resolvedAt: checkedAt, status: "resolved" },
      where: clearedIncidentWhere("keyword_1", "rule_1", checkedAt),
    });
  });

  it("treats an incident cleared after this check as newer than the opening check", () => {
    const checkedAt = new Date("2026-11-01T12:00:00.000Z");
    expect(newerResolvedIncidentWhere("keyword_1", "rule_1", checkedAt)).toEqual({
      keywordId: "keyword_1",
      OR: [
        { rankCheck: { is: { checkedAt: { gt: checkedAt } } } },
        { firedAt: { gt: checkedAt }, rankCheckId: null },
        { resolvedAt: { gt: checkedAt } },
      ],
      ruleId: "rule_1",
      status: "resolved",
    });
  });

  it("resolveClearedTriggeredAlerts closes all non-resolved alerts", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 2 });

    await resolveClearedTriggeredAlerts("keyword_1", "rule_1", now);

    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: { resolvedAt: now, status: "resolved" },
      where: {
        keywordId: "keyword_1",
        ruleId: "rule_1",
        status: { not: "resolved" },
      },
    });
  });

  it("reports whether stateful condition state is known", () => {
    expect(statefulStateKnown("ctr_drop", snap({ ctrDropMetrics: null }))).toBe(false);
    expect(statefulStateKnown("ctr_drop", snap({ ctrDropMetrics: undefined }))).toBe(false);
    expect(
      statefulStateKnown(
        "ctr_drop",
        snap({
          ctrDropMetrics: {
            baselineCtr: 0.1,
            baselinePosition: 4,
            currentCtr: 0.09,
            currentPosition: 4.1,
          },
        }),
      ),
    ).toBe(true);
    expect(statefulStateKnown("downtrend", snap())).toBe(false);
    expect(statefulStateKnown("downtrend", snap({ recentChecks: [] }))).toBe(false);
    expect(statefulStateKnown("downtrend", snap({ recentChecks: [{ position: 1 }] }))).toBe(false);
    expect(
      statefulStateKnown(
        "downtrend",
        snap({
          recentChecks: [
            { position: 1 },
            { position: 2 },
            { position: null },
            { position: 4 },
            { position: 5 },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      statefulStateKnown(
        "downtrend",
        snap({
          recentChecks: [
            { position: 1 },
            { position: 2 },
            { position: 3 },
            { position: 4 },
            { position: 5 },
          ],
        }),
      ),
    ).toBe(true);
    expect(statefulStateKnown("url_mismatch", snap())).toBe(true);
  });
});
