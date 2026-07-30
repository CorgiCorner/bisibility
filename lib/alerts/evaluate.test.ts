import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AlertConditionRule,
  type AlertRankSnapshot,
  evaluateKeywordAlerts,
  matchesAlertCondition,
} from "./evaluate";

const mocks = vi.hoisted(() => ({
  loadGscCtrMetrics: vi.fn(),
  recordSuppressed: vi.fn(),
  reserveRuleDailyBudget: vi.fn(),
  sendAlertOverflowNotice: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    alertRule: { findMany: vi.fn() },
    keyword: { findUnique: vi.fn() },
    signal: { findFirst: vi.fn() },
    triggeredAlert: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  emitSignal: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));
vi.mock("./daily-cap", () => ({
  recordSuppressed: mocks.recordSuppressed,
  reserveRuleDailyBudget: mocks.reserveRuleDailyBudget,
}));
vi.mock("./overflow-notice", () => ({
  sendAlertOverflowNotice: mocks.sendAlertOverflowNotice,
}));
vi.mock("./ctr-drop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ctr-drop")>()),
  loadGscCtrMetrics: mocks.loadGscCtrMetrics,
}));

function rule(input: Partial<AlertConditionRule>): AlertConditionRule {
  return {
    changePct: null,
    competitorDomain: null,
    conditionType: "threshold",
    dropPositions: null,
    serpFeature: null,
    thresholdPosition: null,
    topN: null,
    ...input,
  } as AlertConditionRule;
}

function snap(position: number | null, extra: Partial<AlertRankSnapshot> = {}) {
  return { position, ...extra } as AlertRankSnapshot;
}

function trend(...positions: (number | null)[]) {
  return positions.map((position, index) => ({
    checkedAt: new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
    position,
    rankCheckId: `check_${index + 1}`,
  }));
}

function storedTrend(...positions: (number | null)[]) {
  return trend(...positions).map((check) => ({
    checkedAt: check.checkedAt,
    id: check.rankCheckId,
    keywordId: "keyword_1",
    position: check.position,
  }));
}

function storedRule(input: Partial<AlertConditionRule>, id = "rule_1") {
  return {
    ...rule(input),
    channels: ["email"],
    createdBy: { email: "owner@example.com" },
    id,
    name: "Rule",
    severity: "warning",
    targetType: "all",
    targets: [],
  };
}

describe("matchesAlertCondition", () => {
  it.each([
    ["threshold", rule({ conditionType: "threshold", thresholdPosition: 10 }), snap(8), snap(12)],
    ["change_pct", rule({ changePct: 25 as never, conditionType: "change_pct" }), snap(4), snap(5)],
    [
      "position_drop",
      rule({ conditionType: "position_drop", dropPositions: 5 }),
      snap(12),
      snap(19),
    ],
    [
      "downtrend",
      rule({ conditionType: "downtrend" }),
      snap(12),
      snap(15, { recentChecks: trend(8, 10, 9, 12, 15) }),
    ],
    ["enters_top_n", rule({ conditionType: "enters_top_n", topN: 3 }), snap(4), snap(3)],
    ["exits_top_n", rule({ conditionType: "exits_top_n", topN: 10 }), snap(8), snap(14)],
    [
      "competitor_overtake",
      rule({ competitorDomain: "rankzly.io", conditionType: "competitor_overtake" }),
      snap(5, { competitorsAbove: [] }),
      snap(6, { competitorsAbove: ["rankzly.io"] }),
    ],
    [
      "serp_feature",
      rule({ conditionType: "serp_feature", serpFeature: "featured snippet" }),
      snap(5, { serpFeatures: [] }),
      snap(5, { serpFeatures: ["featured snippet"] }),
    ],
    [
      "url_mismatch",
      rule({ conditionType: "url_mismatch" }),
      snap(5),
      snap(5, {
        rankingUrl: "https://example.com/blog/wrong",
        targetUrl: "https://example.com/blog/target",
      }),
    ],
  ])("matches %s", (_name, candidate, before, after) => {
    expect(matchesAlertCondition(candidate, before, after)).toBe(true);
  });

  it("does not match an already-present SERP feature", () => {
    expect(
      matchesAlertCondition(
        rule({ conditionType: "serp_feature", serpFeature: "images" }),
        snap(2, { serpFeatures: ["images"] }),
        snap(2, { serpFeatures: ["images"] }),
      ),
    ).toBe(false);
  });

  it("normalizes feature separators and rejects empty or non-finite thresholds", () => {
    expect(
      matchesAlertCondition(
        rule({ conditionType: "serp_feature", serpFeature: "people-also_ask" }),
        snap(2, { serpFeatures: [] }),
        snap(2, { serpFeatures: ["People Also Ask"] }),
      ),
    ).toBe(true);
    expect(
      matchesAlertCondition(
        rule({ changePct: Number.NaN as never, conditionType: "change_pct" }),
        snap(10),
        snap(20),
      ),
    ).toBe(false);
    expect(
      matchesAlertCondition(
        rule({ conditionType: "serp_feature", serpFeature: "images" }),
        snap(2),
        snap(2),
      ),
    ).toBe(false);
    expect(
      matchesAlertCondition(
        rule({ conditionType: "serp_feature", serpFeature: "" }),
        snap(2),
        snap(2, { serpFeatures: ["images"] }),
      ),
    ).toBe(false);
  });

  it.each([
    ["target URL is empty", snap(2, { rankingUrl: "https://example.com/a", targetUrl: "" })],
    ["ranking URL is empty", snap(2, { rankingUrl: "", targetUrl: "https://example.com/a" })],
    [
      "keyword is unranked",
      snap(null, { rankingUrl: "https://example.com/b", targetUrl: "https://example.com/a" }),
    ],
    [
      "URLs match after normalization",
      snap(2, {
        rankingUrl: "http://example.com/a?utm=1#frag",
        targetUrl: "https://www.example.com/a/",
      }),
    ],
  ])("does not match url_mismatch when %s", (_name, after) => {
    expect(matchesAlertCondition(rule({ conditionType: "url_mismatch" }), snap(2), after)).toBe(
      false,
    );
  });

  it.each([
    ["rank improved", snap(19), snap(12)],
    ["drop is smaller than threshold", snap(12), snap(16)],
    ["previous rank is missing", snap(null), snap(16)],
    ["current rank is missing", snap(12), snap(null)],
  ])("does not match position_drop when %s", (_name, before, after) => {
    expect(
      matchesAlertCondition(
        rule({ conditionType: "position_drop", dropPositions: 5 }),
        before,
        after,
      ),
    ).toBe(false);
  });

  it.each([
    ["fewer than 5 checks", trend(8, 10, 12, 15)],
    ["mixed up/down does not meet 3 of 4", trend(8, 10, 9, 8, 15)],
    ["net change is not a decline", trend(10, 12, 9, 11, 9)],
    ["one rank is missing", trend(8, 10, null, 12, 15)],
  ])("does not match downtrend when %s", (_name, recentChecks) => {
    expect(
      matchesAlertCondition(
        rule({ conditionType: "downtrend" }),
        snap(12),
        snap(15, { recentChecks }),
      ),
    ).toBe(false);
  });

  it.each([
    [
      "the threshold position is missing",
      rule({ conditionType: "threshold", thresholdPosition: null }),
      snap(5),
      snap(20),
    ],
    [
      "the percentage threshold is missing",
      rule({ changePct: null, conditionType: "change_pct" }),
      snap(5),
      snap(20),
    ],
    [
      "the previous percentage position is missing",
      rule({ changePct: 20 as never, conditionType: "change_pct" }),
      snap(null),
      snap(20),
    ],
    [
      "the top-N entry threshold is missing",
      rule({ conditionType: "enters_top_n", topN: null }),
      snap(5),
      snap(1),
    ],
    [
      "the keyword is already inside the top-N threshold",
      rule({ conditionType: "enters_top_n", topN: 3 }),
      snap(2),
      snap(1),
    ],
    [
      "the top-N exit threshold is missing",
      rule({ conditionType: "exits_top_n", topN: null }),
      snap(1),
      snap(20),
    ],
    [
      "the keyword is already outside the top-N threshold",
      rule({ conditionType: "exits_top_n", topN: 10 }),
      snap(20),
      snap(21),
    ],
    [
      "the competitor domain is missing",
      rule({ competitorDomain: null, conditionType: "competitor_overtake" }),
      snap(1),
      snap(2, { competitorsAbove: ["example.com"] }),
    ],
    [
      "the condition type is unknown",
      rule({ conditionType: "unknown" as never }),
      snap(1),
      snap(2),
    ],
  ])("returns false when %s", (_caseName, candidate, before, after) => {
    expect(matchesAlertCondition(candidate, before, after)).toBe(false);
  });
});

describe("evaluateKeywordAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.loadGscCtrMetrics.mockResolvedValue(null);
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      id: "keyword_1",
      project: {
        domain: "example.com",
        id: "project_1",
        name: "Example",
        slackConnection: null,
        webhookEndpoints: [{ hmacSecret: "encrypted", id: "webhook_1", url: "https://e.test" }],
      },
      projectId: "project_1",
      publicId: "kw_1",
      targetUrl: "https://example.com/rank-tracker",
      tags: [{ tagId: "tag_1" }],
      text: "rank tracker",
    });
    mocks.prisma.triggeredAlert.create.mockResolvedValue({
      firedAt: new Date("2026-01-01T06:00:00.000Z"),
      id: "alert_1",
    });
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue(null);
    mocks.prisma.triggeredAlert.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.signal.findFirst.mockResolvedValue(null);
    mocks.emitSignal.mockResolvedValue({ id: "signal_1" });
    mocks.reserveRuleDailyBudget.mockResolvedValue(true);
    mocks.recordSuppressed.mockResolvedValue({ overflowNoticeDue: false });
    mocks.sendAlertOverflowNotice.mockResolvedValue(undefined);
  });

  it("defers delivery for scheduled checks", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "threshold", thresholdPosition: 10 }),
    ]);

    await evaluateKeywordAlerts("keyword_1", snap(8), snap(14, { rankCheckId: "check_1" }), {
      deliveryMode: "deferred",
    });

    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ deliveryState: "digest_pending" }),
    });
  });

  it("queues manual checks without delivery inside evaluation", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "threshold", thresholdPosition: 10 }),
    ]);

    await evaluateKeywordAlerts("keyword_1", snap(8), snap(14, { rankCheckId: "check_1" }));

    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ deliveryState: "pending" }),
    });
    expect(mocks.reserveRuleDailyBudget).not.toHaveBeenCalled();
  });

  it("writes a triggered alert for matching targets", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      {
        ...storedRule({ conditionType: "url_mismatch" }),
        targetType: "tag",
        targets: [{ keywordId: null, tagId: "tag_1" }],
      },
      {
        ...storedRule({ conditionType: "url_mismatch" }, "rule_2"),
        targetType: "tag",
        targets: [{ keywordId: null, tagId: "tag_2" }],
      },
    ]);

    const fired = await evaluateKeywordAlerts(
      "keyword_1",
      snap(8),
      snap(14, { rankCheckId: "check_1", rankingUrl: "https://example.com/other-page?utm=1" }),
    );

    expect(fired).toHaveLength(1);
    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        afterPosition: 14,
        beforePosition: 8,
        keywordId: "keyword_1",
        payload: expect.objectContaining({
          conditionType: "url_mismatch",
          headline: "Ranking URL differs from the target URL",
          rankingUrl: "https://example.com/other-page?utm=1",
          severity: "warning",
          targetUrl: "https://example.com/rank-tracker",
        }),
        rankCheckId: "check_1",
        ruleId: "rule_1",
      }),
    });
  });

  it("persists triggered alerts as pending and performs no delivery inside evaluation", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "threshold", thresholdPosition: 10 }),
    ]);

    await expect(
      evaluateKeywordAlerts("keyword_1", snap(8), snap(14, { rankCheckId: "check_1" })),
    ).resolves.toEqual([expect.objectContaining({ id: "alert_1" })]);

    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledOnce();
  });

  it("hydrates completed history for downtrend rules", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([storedRule({ conditionType: "downtrend" })]);
    mocks.prisma.$queryRaw.mockResolvedValue(storedTrend(8, 10, 9, 12, 15));

    const fired = await evaluateKeywordAlerts(
      "keyword_1",
      snap(12),
      snap(15, { checkedAt: new Date("2026-01-05T00:00:00.000Z"), rankCheckId: "check_5" }),
    );

    expect(fired).toHaveLength(1);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        afterPosition: 15,
        beforePosition: 8,
        payload: expect.objectContaining({
          conditionType: "downtrend",
          current: "#15",
          headline: "Downtrend: declined in 3 of last 5 checks (8 \u2192 15)",
          previous: "#8",
        }),
        ruleId: "rule_1",
      }),
    });
  });

  it("loads GSC metrics once and triggers a CTR drop rule", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ changePct: 20 as never, conditionType: "ctr_drop" }),
    ]);
    mocks.loadGscCtrMetrics.mockResolvedValue({
      baselineCtr: 0.1,
      baselinePosition: 4.2,
      currentCtr: 0.07,
      currentPosition: 4.8,
    });

    const checkedAt = new Date("2026-07-16T18:00:00.000Z");
    const fired = await evaluateKeywordAlerts(
      "keyword_1",
      snap(4),
      snap(5, { checkedAt, rankCheckId: "check_1" }),
    );

    expect(fired).toHaveLength(1);
    expect(mocks.loadGscCtrMetrics).toHaveBeenCalledOnce();
    expect(mocks.loadGscCtrMetrics).toHaveBeenCalledWith({
      checkedAt,
      keywordId: "keyword_1",
    });
    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          conditionType: "ctr_drop",
          current: "7.0% CTR",
          previous: "10.0% CTR",
        }),
        ruleId: "rule_1",
      }),
    });
  });

  it("does not trigger a duplicate alert while a matching alert is snoozed", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "url_mismatch" }),
    ]);
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue({ id: "alert_snoozed" });

    const fired = await evaluateKeywordAlerts(
      "keyword_1",
      snap(8),
      snap(14, { rankCheckId: "check_1", rankingUrl: "https://example.com/other-page" }),
    );

    expect(fired).toHaveLength(0);
    expect(mocks.prisma.triggeredAlert.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: expect.objectContaining({
        keywordId: "keyword_1",
        ruleId: "rule_1",
        snoozedUntil: expect.objectContaining({ gt: expect.any(Date) }),
      }),
    });
    expect(mocks.prisma.triggeredAlert.create).not.toHaveBeenCalled();
  });

  it("treats a duplicate create on activity retry as already processed", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "threshold", thresholdPosition: 10 }),
    ]);
    mocks.prisma.triggeredAlert.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "alert_existing" });
    mocks.prisma.triggeredAlert.create.mockRejectedValue(new Error("unique constraint"));

    await expect(
      evaluateKeywordAlerts("keyword_1", snap(8), snap(14, { rankCheckId: "check_1" })),
    ).resolves.toEqual([]);
  });

  it("does not re-fire a stateful condition while a previous alert is open", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "url_mismatch" }),
    ]);
    mocks.prisma.triggeredAlert.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "alert_open" });

    await expect(
      evaluateKeywordAlerts(
        "keyword_1",
        snap(8),
        snap(14, {
          rankingUrl: "https://example.com/other-page",
          targetUrl: "https://example.com/rank-tracker",
        }),
      ),
    ).resolves.toEqual([]);
    expect(mocks.prisma.triggeredAlert.create).not.toHaveBeenCalled();
  });

  it("auto-resolves open stateful alerts when the condition clears", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "url_mismatch" }),
    ]);

    await evaluateKeywordAlerts(
      "keyword_1",
      snap(8),
      snap(14, { rankingUrl: "https://example.com/rank-tracker" }),
    );

    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: { resolvedAt: expect.any(Date), status: "resolved" },
      where: {
        keywordId: "keyword_1",
        ruleId: "rule_1",
        status: { not: "resolved" },
      },
    });
    expect(mocks.prisma.triggeredAlert.create).not.toHaveBeenCalled();
  });

  it("does not auto-resolve ctr_drop when GSC metrics are unavailable", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ changePct: 20 as never, conditionType: "ctr_drop" }),
    ]);
    mocks.loadGscCtrMetrics.mockResolvedValue(null);

    await evaluateKeywordAlerts("keyword_1", snap(4), snap(5));

    expect(mocks.prisma.triggeredAlert.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["the five-check window is incomplete", storedTrend(8, 9, 10)],
    ["a position in the five-check window is unknown", storedTrend(8, 9, null, 10)],
  ])("does not auto-resolve downtrend when %s", async (_name, history) => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([storedRule({ conditionType: "downtrend" })]);
    mocks.prisma.$queryRaw.mockResolvedValue(history);

    await evaluateKeywordAlerts("keyword_1", snap(10), snap(9, { rankCheckId: "current_check" }));

    expect(mocks.prisma.triggeredAlert.updateMany).not.toHaveBeenCalled();
  });

  it("auto-resolves downtrend after five known checks show recovery", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([storedRule({ conditionType: "downtrend" })]);
    mocks.prisma.$queryRaw.mockResolvedValue(storedTrend(12, 10, 11, 9));

    await evaluateKeywordAlerts("keyword_1", snap(9), snap(8, { rankCheckId: "current_check" }));

    expect(mocks.prisma.triggeredAlert.updateMany).toHaveBeenCalledWith({
      data: { resolvedAt: expect.any(Date), status: "resolved" },
      where: {
        keywordId: "keyword_1",
        ruleId: "rule_1",
        status: { not: "resolved" },
      },
    });
  });

  it("does not auto-resolve transition conditions on a non-matching check", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "threshold", thresholdPosition: 10 }),
    ]);

    await evaluateKeywordAlerts("keyword_1", snap(12), snap(13));

    expect(mocks.prisma.triggeredAlert.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.triggeredAlert.create).not.toHaveBeenCalled();
  });

  it("fires a fresh stateful alert once the previous episode is resolved", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "url_mismatch" }),
    ]);
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue(null);

    const fired = await evaluateKeywordAlerts(
      "keyword_1",
      snap(8),
      snap(14, { rankingUrl: "https://example.com/other-page" }),
    );

    expect(fired).toHaveLength(1);
    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledOnce();
  });

  it("hydrates competitor and SERP feature conditions from stored raw snapshots", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule(
        { competitorDomain: "rankzly.io", conditionType: "competitor_overtake" },
        "rule_competitor",
      ),
      storedRule(
        { conditionType: "serp_feature", serpFeature: "featured snippet" },
        "rule_feature",
      ),
    ]);

    const fired = await evaluateKeywordAlerts(
      "keyword_1",
      snap(4, {
        raw: {
          organic_results: [
            { domain: "example.com", rank: 4, url: "https://example.com/page" },
            { domain: "rankzly.io", rank: 6, url: "https://rankzly.io/page" },
          ],
          serp_features: [],
        },
      }),
      snap(6, {
        rankCheckId: "check_1",
        raw: {
          organic_results: [
            { domain: "rankzly.io", rank: 2, url: "https://rankzly.io/page" },
            { domain: "example.com", rank: 6, url: "https://example.com/page" },
          ],
          serp_features: ["featured snippet"],
        },
      }),
    );

    expect(fired).toHaveLength(2);
    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rankCheckId: "check_1", ruleId: "rule_competitor" }),
    });
    expect(mocks.prisma.triggeredAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rankCheckId: "check_1", ruleId: "rule_feature" }),
    });
  });

  it("hydrates camel-case raw results and tolerates malformed result entries", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ competitorDomain: "rankzly.io", conditionType: "competitor_overtake" }),
    ]);
    const fired = await evaluateKeywordAlerts(
      "keyword_1",
      snap(3, { raw: { organicResults: [] } }),
      snap(8, {
        raw: {
          organicResults: [
            null,
            "bad",
            { position: "not-a-number", source: "::invalid/path" },
            { displayed_link: "www.rankzly.io/page", rank_absolute: 2 },
          ],
        },
      }),
    );
    expect(fired).toHaveLength(1);
  });

  it("returns early when the keyword no longer exists", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValue(null);
    await expect(evaluateKeywordAlerts("missing", snap(1), snap(2))).resolves.toEqual([]);
    expect(mocks.prisma.alertRule.findMany).not.toHaveBeenCalled();
  });

  it("skips matching targets whose alert condition did not fire", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "threshold", thresholdPosition: 10 }),
    ]);
    await expect(evaluateKeywordAlerts("keyword_1", snap(5), snap(6))).resolves.toEqual([]);
    expect(mocks.prisma.triggeredAlert.create).not.toHaveBeenCalled();
  });

  it("skips depth-conflicting rules and emits one signal per rule and keyword", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      storedRule({ conditionType: "threshold", thresholdPosition: 50 }),
    ]);
    mocks.prisma.signal.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "signal_existing" });

    const after = snap(60, {
      checkedAt: new Date("2026-07-15T18:30:00.000Z"),
      rankCheckId: "check_1",
      requestedDepth: 10,
    });
    await expect(evaluateKeywordAlerts("keyword_1", snap(5), after)).resolves.toEqual([]);
    await expect(evaluateKeywordAlerts("keyword_1", snap(5), after)).resolves.toEqual([]);

    expect(mocks.emitSignal).toHaveBeenCalledOnce();
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordId: "keyword_1",
        payload: { requestedDepth: 10, ruleId: "rule_1", threshold: 50 },
        projectId: "project_1",
        severity: "warning",
        type: "depth_conflict",
      }),
    );
    expect(mocks.prisma.triggeredAlert.create).not.toHaveBeenCalled();
  });

  it("matches keyword targets and ignores unknown targets", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      {
        ...storedRule({ conditionType: "url_mismatch" }, "keyword_rule"),
        targetType: "keyword",
        targets: [{ keywordId: "keyword_1", tagId: null }],
      },
      {
        ...storedRule({ conditionType: "url_mismatch" }, "unknown_rule"),
        targetType: "unknown",
        targets: [],
      },
    ]);

    const fired = await evaluateKeywordAlerts(
      "keyword_1",
      snap(4),
      snap(8, { rankingUrl: "https://other.example.com/page" }),
    );

    expect(fired).toHaveLength(1);
  });
});
