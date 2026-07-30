import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAlertFeedStats, listTriggeredAlertViews } from "./alert-list";

const mocks = vi.hoisted(() => ({
  cacheEntries: new Map<unknown, Map<string, unknown>>(),
  prisma: {
    $queryRaw: vi.fn(),
    keyword: { findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    triggeredAlert: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
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

describe("alert feed window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    mocks.cacheEntries.clear();
    mocks.prisma.$queryRaw.mockResolvedValue([
      { firedInWindowCount: 0n, snoozedInWindowCount: 0n, totalCount: 0n },
    ]);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { id: "keyword_1", schedule: null, tags: [], text: "rank tracker" },
    ]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("includes an alert from 47 hours ago and excludes one from 49 hours ago", async () => {
    await listTriggeredAlertViews("project_1");

    const query = mocks.prisma.triggeredAlert.findMany.mock.calls[0]?.[0];
    const windowStart = query.where.firedAt.gte as Date;
    const alertAt47Hours = new Date(Date.now() - 47 * 60 * 60 * 1000);
    const alertAt49Hours = new Date(Date.now() - 49 * 60 * 60 * 1000);

    expect(alertAt47Hours.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
    expect(alertAt49Hours.getTime()).toBeLessThan(windowStart.getTime());
    expect(windowStart).toEqual(new Date("2026-07-13T12:00:00.000Z"));
  });

  it("maps delivery state and recent channel attempts into the alert view", async () => {
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      {
        afterPosition: 14,
        beforePosition: 8,
        deliveryAttempts: [
          {
            attemptedAt: new Date("2026-07-15T11:55:00.000Z"),
            channel: "webhook",
            error: "Webhook endpoint rate limited.",
            id: "attempt_1",
            status: "failed",
            webhookEndpoint: {
              description: "Primary alerts",
              publicId: "we_abcdefghijklmnopqrstuvwx",
              url: "https://hooks.example.com/alerts",
            },
            webhookEndpointId: "webhook_1",
          },
        ],
        deliveryState: "dead_letter",
        firedAt: new Date("2026-07-15T11:54:00.000Z"),
        id: "alert_1",
        keywordId: "keyword_1",
        payload: null,
        publicId: "al_abcdefghijklmnopqrstuvwx",
        rule: {
          conditionType: "exits_top_n",
          name: "Slipped",
          projectId: "project_1",
          severity: "urgent",
        },
        status: "firing",
      },
    ]);

    await expect(listTriggeredAlertViews("project_1")).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: [
          expect.objectContaining({
            channel: "webhook",
            status: "failed",
            webhookEndpointId: "we_abcdefghijklmnopqrstuvwx",
            webhookEndpointLabel: "Primary alerts",
            when: "5m ago",
          }),
        ],
        deliveryState: "dead_letter",
      }),
    ]);
    expect(mocks.prisma.triggeredAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          deliveryAttempts: {
            include: {
              webhookEndpoint: { select: { description: true, publicId: true, url: true } },
            },
            orderBy: { attemptedAt: "desc" },
            take: 3,
          },
        }),
      }),
    );
  });

  it("uses the endpoint URL and deleted fallback when no description is available", async () => {
    const baseAlert = {
      afterPosition: 14,
      beforePosition: 8,
      deliveryState: "delivered",
      firedAt: new Date("2026-07-15T11:54:00.000Z"),
      id: "alert_1",
      keywordId: "keyword_1",
      payload: null,
      publicId: "al_abcdefghijklmnopqrstuvwx",
      rule: {
        conditionType: "exits_top_n",
        name: "Slipped",
        projectId: "project_1",
        severity: "urgent",
      },
      status: "firing",
    };
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      {
        ...baseAlert,
        deliveryAttempts: [
          {
            attemptedAt: new Date("2026-07-15T11:55:00.000Z"),
            channel: "webhook",
            error: null,
            id: "attempt_url",
            status: "sent",
            webhookEndpoint: {
              description: null,
              publicId: "we_abcdefghijklmnopqrstuvwx",
              url: "https://hooks.example.com/alerts",
            },
            webhookEndpointId: "webhook_1",
          },
          {
            attemptedAt: new Date("2026-07-15T11:54:30.000Z"),
            channel: "webhook",
            error: null,
            id: "attempt_deleted",
            status: "sent",
            webhookEndpoint: null,
            webhookEndpointId: null,
          },
        ],
      },
    ]);

    const [alert] = await listTriggeredAlertViews("project_1");

    expect(alert.deliveryAttempts.map((attempt) => attempt.webhookEndpointLabel)).toEqual([
      "https://hooks.example.com/alerts",
      "Deleted endpoint",
    ]);
  });

  it("does not expose raw triggered-alert or delivery-attempt identifiers", async () => {
    const rawAlert = "clx0123456789abcdefghijklm";
    const rawAttempt = "clx1123456789abcdefghijklm";
    mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
      {
        afterPosition: 14,
        beforePosition: 8,
        deliveryAttempts: [
          {
            attemptedAt: new Date("2026-07-15T11:55:00.000Z"),
            channel: "webhook",
            error: null,
            id: rawAttempt,
            status: "sent",
            webhookEndpoint: {
              description: "Primary alerts",
              publicId: "we_abcdefghijklmnopqrstuvwx",
              url: "https://hooks.example.com/alerts",
            },
            webhookEndpointId: "webhook_1",
          },
        ],
        deliveryState: "delivered",
        firedAt: new Date("2026-07-15T11:54:00.000Z"),
        id: rawAlert,
        keywordId: "keyword_1",
        payload: null,
        publicId: "al_abcdefghijklmnopqrstuvwx",
        rule: {
          conditionType: "exits_top_n",
          name: "Slipped",
          projectId: "project_1",
          severity: "urgent",
        },
        status: "firing",
      },
    ]);

    const [alert] = await listTriggeredAlertViews("project_1");

    expect(alert.id).toBe("al_abcdefghijklmnopqrstuvwx");
    expect(alert.deliveryAttempts[0]).not.toHaveProperty("id");
    expect(JSON.stringify(alert)).not.toContain(rawAlert);
    expect(JSON.stringify(alert)).not.toContain(rawAttempt);
  });

  it("counts fired alerts independently from the visible snooze filter", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      { firedInWindowCount: 4n, snoozedInWindowCount: 2n, totalCount: 9n },
    ]);

    await expect(getAlertFeedStats("project_1")).resolves.toEqual({
      firedInWindowCount: 4,
      snoozedInWindowCount: 2,
      totalCount: 9,
    });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      new Date("2026-07-13T12:00:00.000Z"),
      new Date("2026-07-13T12:00:00.000Z"),
      new Date("2026-07-15T12:00:00.000Z"),
      "project_1",
    ]);
  });
});
