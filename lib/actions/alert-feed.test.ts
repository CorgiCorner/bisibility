import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAlertCtaTargets, muteTriggeredAlert, setAlertKeywordTargetUrl } from "./alert-feed";

const mocks = vi.hoisted(() => ({
  bulkSetTargetUrl: vi.fn(),
  coreMuteTriggeredAlert: vi.fn(),
  getActionActor: vi.fn(),
  parseActionInput: vi.fn((schema, input) => schema.parse(input)),
  prisma: {
    triggeredAlert: { findFirst: vi.fn(), update: vi.fn() },
  },
  requireProjectScope: vi.fn(),
  revalidatePath: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/alerts/feed-mutations", () => ({
  muteTriggeredAlert: mocks.coreMuteTriggeredAlert,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./keyword-bulk", () => ({ bulkSetTargetUrl: mocks.bulkSetTargetUrl }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: mocks.parseActionInput,
  requireProjectScope: mocks.requireProjectScope,
  revalidateAlertViews: () => {
    mocks.revalidatePath("/app/alerts");
    mocks.revalidatePath("/app/settings/audit");
  },
}));

describe("alert feed actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T06:00:00.000Z"));
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({
      id: "project_1",
      publicId: "prj_a00000000000000000000000",
    });
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValue({
      id: "alert_1",
      snoozedUntil: null,
      status: "firing",
    });
    mocks.prisma.triggeredAlert.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "alert_1", snoozedUntil: data.snoozedUntil, status: "firing" }),
    );
    mocks.coreMuteTriggeredAlert.mockResolvedValue({
      muted: true,
      snoozedUntil: new Date("2026-01-02T06:00:00.000Z"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists snooze expiry without muting the alert status", async () => {
    const result = await muteTriggeredAlert({
      alertId: "al_a00000000000000000000000",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.coreMuteTriggeredAlert).toHaveBeenCalledWith(
      {
        actor: { id: "user_1" },
        alertId: "al_a00000000000000000000000",
        projectId: "prj_a00000000000000000000000",
      },
      expect.any(Function),
    );
    expect(result).toEqual({ muted: true, snoozedUntil: new Date("2026-01-02T06:00:00.000Z") });
  });

  it.each([
    ["javascript:alert(1)", null],
    ["data:text/html,hello", null],
    ["ftp://example.com/serp", null],
    ["not a url", null],
    [null, "javascript:alert(1)"],
  ])(
    "returns a web SERP URL instead of unsafe payload %s or ranking %s",
    async (url, rankingUrl) => {
      mocks.prisma.triggeredAlert.findFirst.mockResolvedValueOnce({
        keyword: { publicId: "kw_a00000000000000000000000", targetUrl: null, text: "rank tracker" },
        payload: url === null ? {} : { url },
        rankCheck: { rankingUrl },
      });

      const targets = await getAlertCtaTargets({
        alertId: "al_a00000000000000000000000",
        projectId: "prj_a00000000000000000000000",
      });

      expect(targets.serpUrl).toBe("https://www.google.com/search?q=rank%20tracker");
    },
  );

  it("keeps a web SERP URL from the alert payload", async () => {
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValueOnce({
      keyword: { publicId: "kw_a00000000000000000000000", targetUrl: null, text: "rank tracker" },
      payload: { serpUrl: "javascript:alert(1)", url: "https://example.com/serp" },
      rankCheck: { rankingUrl: "https://example.org/page" },
    });

    const targets = await getAlertCtaTargets({
      alertId: "al_a00000000000000000000000",
      projectId: "prj_a00000000000000000000000",
    });

    expect(targets.serpUrl).toBe("https://example.com/serp");
  });

  it("forwards one explicit target URL from an alert", async () => {
    mocks.prisma.triggeredAlert.findFirst.mockResolvedValueOnce({
      keyword: { publicId: "kw_a00000000000000000000000" },
    });
    mocks.bulkSetTargetUrl.mockResolvedValueOnce({ updated: 1 });

    await setAlertKeywordTargetUrl({
      alertId: "al_a00000000000000000000000",
      projectId: "prj_a00000000000000000000000",
      targetUrl: "/features/rank-tracking",
    });

    expect(mocks.bulkSetTargetUrl).toHaveBeenCalledWith({
      keywordIds: ["kw_a00000000000000000000000"],
      projectId: "prj_a00000000000000000000000",
      targetUrl: "/features/rank-tracking",
    });
  });

  it("rejects an empty alert target instead of treating it as a hidden clear", async () => {
    await expect(
      setAlertKeywordTargetUrl({
        alertId: "al_a00000000000000000000000",
        projectId: "prj_a00000000000000000000000",
        targetUrl: "",
      }),
    ).rejects.toThrow("Enter a target URL.");

    expect(mocks.bulkSetTargetUrl).not.toHaveBeenCalled();
  });
});
