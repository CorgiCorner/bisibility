import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAlertsView } from "./alerts";

const mocks = vi.hoisted(() => ({
  cacheEntries: new Map<unknown, Map<string, unknown>>(),
  prisma: {
    alertRule: { findMany: vi.fn() },
    keyword: { findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    tag: { findMany: vi.fn() },
    triggeredAlert: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    webhookEndpoint: { findMany: vi.fn() },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("react", () => ({
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      let entries = mocks.cacheEntries.get(fn);
      if (!entries) {
        entries = new Map();
        mocks.cacheEntries.set(fn, entries);
      }
      const key = JSON.stringify(args);
      if (!entries.has(key)) entries.set(key, fn(...args));
      return entries.get(key);
    },
}));

describe("getAlertsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheEntries.clear();
    mocks.requireReadableProject.mockResolvedValue({
      project: {
        domain: "example.com",
        id: "project_1",
        name: "Example",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
      },
    });
    mocks.prisma.alertRule.findMany.mockResolvedValue([]);
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([]);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.tag.findMany.mockResolvedValue([]);
    mocks.prisma.user.findMany.mockResolvedValue([]);
    mocks.prisma.webhookEndpoint.findMany.mockResolvedValue([]);
  });

  it("hides alerts that are actively snoozed", async () => {
    await getAlertsView("prj_abcdefghijklmnopqrstuvwx");

    expect(mocks.prisma.triggeredAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
          rule: { projectId: "project_1" },
        }),
      }),
    );
  });

  it("includes the readable project domain in alert targets", async () => {
    const view = await getAlertsView("prj_abcdefghijklmnopqrstuvwx");

    expect(view.targets.projectDomain).toBe("example.com");
  });

  it("includes project webhook targets and the active private-network policy", async () => {
    mocks.prisma.webhookEndpoint.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        deliveryAttempts: [],
        description: "CI sink",
        enabled: true,
        id: "endpoint_1",
        lastDeliveryAt: new Date("2026-07-25T12:00:00.000Z"),
        publicId: "we_abcdefghijklmnopqrstuvwx",
        updatedAt: new Date(),
        url: "https://example.com/alerts",
      },
    ]);

    const view = await getAlertsView("prj_abcdefghijklmnopqrstuvwx");

    expect(view.targets.webhookEndpoints).toEqual([
      {
        deliveryAttempts: [],
        description: "CI sink",
        enabled: true,
        id: "we_abcdefghijklmnopqrstuvwx",
        lastDeliveryAt: "2026-07-25T12:00:00.000Z",
        url: "https://example.com/alerts",
      },
    ]);
    expect(view.targets.webhookPrivateNetworkAllowed).toBe(false);
  });

  it("loads bounded endpoint history and derives the delivery event from the rank-check trigger", async () => {
    mocks.prisma.webhookEndpoint.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        deliveryAttempts: [
          {
            attemptedAt: new Date("2026-07-25T12:01:00.000Z"),
            error: "Webhook failed with status 500.",
            id: "attempt_1",
            status: "failed",
            triggeredAlert: { rankCheck: { trigger: "scheduled" } },
          },
          {
            attemptedAt: new Date("2026-07-25T12:00:00.000Z"),
            error: null,
            id: "attempt_2",
            status: "sent",
            triggeredAlert: { rankCheck: { trigger: "manual" } },
          },
        ],
        description: null,
        enabled: true,
        id: "endpoint_1",
        lastDeliveryAt: new Date("2026-07-25T12:00:00.000Z"),
        publicId: "we_abcdefghijklmnopqrstuvwx",
        updatedAt: new Date(),
        url: "https://example.com/alerts",
      },
    ]);

    const view = await getAlertsView("prj_abcdefghijklmnopqrstuvwx");

    expect(mocks.prisma.webhookEndpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          deliveryAttempts: expect.objectContaining({ take: 10 }),
        }),
      }),
    );
    expect(view.targets.webhookEndpoints?.[0]?.deliveryAttempts).toEqual([
      expect.objectContaining({ event: "alert.digest", status: "failed" }),
      expect.objectContaining({ event: "alert.fired", status: "sent" }),
    ]);
    expect(view.targets.webhookEndpoints?.[0]?.deliveryAttempts?.[0]).not.toHaveProperty("id");
    expect(JSON.stringify(view.targets.webhookEndpoints)).not.toContain("attempt_1");
    expect(JSON.stringify(view.targets.webhookEndpoints)).not.toContain("attempt_2");
  });

  it("computes a depth-conflict badge model from targeted keyword depth", async () => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      {
        changePct: null,
        channels: [],
        competitorDomain: null,
        conditionType: "exits_top_n",
        dropPositions: null,
        enabled: true,
        id: "rule_1",
        name: "Exit top 50",
        publicId: "alr_abcdefghijklmnopqrstuvwx",
        recipients: [],
        serpFeature: null,
        targetType: "keyword",
        targets: [
          {
            keyword: { publicId: "kw_abcdefghijklmnopqrstuvwx" },
            keywordId: "keyword_1",
            tag: null,
            tagId: null,
          },
        ],
        thresholdPosition: null,
        topN: 50,
        triggered: [],
      },
    ]);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        id: "keyword_1",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        schedule: { serpDepth: 20 },
        tags: [],
        text: "rank tracker",
      },
    ]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({ serpDepth: 100 });

    const view = await getAlertsView("prj_abcdefghijklmnopqrstuvwx");

    expect(view.rules[0]?.depthConflict).toEqual({ threshold: 50, trackedDepth: 20 });
    expect(view.rules[0]?.targetIds).toEqual(["kw_abcdefghijklmnopqrstuvwx"]);
  });

  it("maps all client-selectable alert targets to typed public IDs", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        id: "keyword_1",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        schedule: null,
        tags: [
          {
            tag: { publicId: "tag_abcdefghijklmnopqrstuvwx" },
            tagId: "tag_1",
          },
        ],
        text: "rank tracker",
      },
    ]);
    mocks.prisma.tag.findMany.mockResolvedValue([
      {
        id: "tag_1",
        name: "Product",
        publicId: "tag_abcdefghijklmnopqrstuvwx",
      },
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([
      {
        email: "owner@example.com",
        id: "user_1",
        name: "Owner",
        publicId: "usr_abcdefghijklmnopqrstuvwx",
      },
    ]);

    const view = await getAlertsView("prj_abcdefghijklmnopqrstuvwx");

    expect(view.targets.keywords).toEqual([
      { id: "kw_abcdefghijklmnopqrstuvwx", label: "rank tracker" },
    ]);
    expect(view.targets.tags).toEqual([{ id: "tag_abcdefghijklmnopqrstuvwx", label: "Product" }]);
    expect(view.targets.members).toEqual([
      {
        id: "usr_abcdefghijklmnopqrstuvwx",
        label: "Owner (owner@example.com)",
      },
    ]);
  });

  it("shares one keyword projection across rules, feed, and target options", async () => {
    await getAlertsView("prj_abcdefghijklmnopqrstuvwx");

    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledOnce();
    expect(mocks.prisma.projectDefaults.findUnique).toHaveBeenCalledOnce();
  });
});
