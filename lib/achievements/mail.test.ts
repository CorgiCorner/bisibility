import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  state: vi.fn(),
  eligible: vi.fn(),
  pending: vi.fn(),
  update: vi.fn(),
  claim: vi.fn(),
  awards: vi.fn(),
  send: vi.fn(),
  configured: true,
  enabled: true,
  token: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    achievementState: { findUnique: m.state, findFirst: m.eligible },
    achievementMail: { findMany: m.pending, updateMany: m.claim, update: m.update },
    achievementAward: { findMany: m.awards },
  },
}));
vi.mock("@/lib/email/instance-mail-store", () => ({ refreshInstanceMailRuntime: vi.fn() }));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: () => m.configured }));
vi.mock("@/lib/email/send", async () => {
  const { EmailBudgetExceededError } = await import("@/lib/email/types");
  return { sendEmail: m.send, EmailBudgetExceededError };
});
vi.mock("./config", () => ({ achievementEmailsEnabled: () => m.enabled }));
vi.mock("./unsubscribe", () => ({
  createAchievementUnsubscribeToken: m.token,
}));

import { sweepAchievementMail } from "./mail";

afterEach(() => vi.unstubAllEnvs());
const now = new Date("2026-10-17T10:00:00Z");
describe("milestone mail delivery", () => {
  it("closes queued mail without a remaining award before it can keep the sweep hot", async () => {
    m.awards.mockResolvedValue([]);
    await sweepAchievementMail(10, now);
    expect(m.claim).toHaveBeenCalledWith({
      where: { id: "m", status: "queued" },
      data: { status: "skipped", finishedAt: now, reason: "award_missing" },
    });
    expect(m.send).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SITE_URL", "https://local-instance.example.com");
    m.enabled = true;
    m.token.mockReturnValue("category-only-test-token");
    m.configured = true;
    m.pending.mockResolvedValue([
      {
        id: "m",
        userId: "a",
        epoch: 1,
        awardDay: "2026-10-16",
        timeZone: "Europe/Warsaw",
        dueAt: now,
      },
    ]);
    m.state.mockResolvedValue({
      enabled: true,
      emailEnabled: true,
      user: {
        email: "a@example.com",
        emailVerified: true,
        uiLocale: "pl",
        deactivatedAt: null,
        marketingEmailUnsubscribedAt: null,
      },
    });
    m.eligible.mockResolvedValue({ userId: "a", user: { email: "a@example.com" } });
    m.awards.mockResolvedValue([{ kind: "presence" }, { kind: "practice" }]);
    m.claim.mockResolvedValue({ count: 1 });
    m.send.mockResolvedValue(undefined);
  });
  it("combines both awards into one localized bulk message and persists its delivery", async () => {
    expect(await sweepAchievementMail(10, now)).toEqual({ sent: 1 });
    expect(m.send).toHaveBeenCalledTimes(1);
    expect(m.send.mock.calls[0][0]).toMatchObject({ category: "bulk", to: "a@example.com" });
    expect(m.send.mock.calls[0][0].text).toContain("category-only-test-token");
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "sent" }) }),
    );
  });
  it.each([
    "enabled",
    "emailEnabled",
    "emailVerified",
    "deactivatedAt",
    "marketingEmailUnsubscribedAt",
  ])("suppresses %s without sending", async (field) => {
    const state = {
      enabled: true,
      emailEnabled: true,
      user: {
        email: "a@example.com",
        emailVerified: true,
        deactivatedAt: null,
        marketingEmailUnsubscribedAt: null,
      },
    };
    if (field === "enabled" || field === "emailEnabled") state[field] = false;
    else (state.user as Record<string, unknown>)[field] = field === "emailVerified" ? false : now;
    m.state.mockResolvedValue(state);
    await sweepAchievementMail(10, now);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("does nothing without opt-in/transport and records ambiguous sends without retrying", async () => {
    m.configured = false;
    await sweepAchievementMail();
    expect(m.pending).not.toHaveBeenCalled();
    m.configured = true;
    m.send.mockRejectedValue(new Error("lost response"));
    await sweepAchievementMail(10, now);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "unknown", reason: "delivery_unconfirmed" }),
      }),
    );
  });
  it("concurrent processors that lose the claim cannot send a second message", async () => {
    m.claim.mockResolvedValue({ count: 0 });
    await sweepAchievementMail(10, now);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("an opt-out arriving after claim is checked again before sending", async () => {
    m.eligible.mockResolvedValue(null);
    await sweepAchievementMail(10, now);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("requires the instance origin instead of falling back to another host", async () => {
    vi.stubEnv("SITE_URL", "");
    await sweepAchievementMail(10, now);
    expect(m.send).not.toHaveBeenCalled();
    expect(m.claim).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "origin_unconfigured" }) }),
    );
  });
  it("skips old awards even when repeated deferrals made their due date recent", async () => {
    m.pending.mockResolvedValue([
      { id: "m", userId: "a", epoch: 1, awardDay: "2026-09-01", timeZone: "UTC", dueAt: now },
    ]);
    await sweepAchievementMail(10, now);
    expect(m.send).not.toHaveBeenCalled();
    expect(m.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "skipped", reason: "stale" }),
      }),
    );
  });
  it("uses the current recipient after claiming", async () => {
    m.eligible.mockResolvedValue({ user: { email: "new@example.com" } });
    await sweepAchievementMail(10, now);
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: "new@example.com" }));
  });
  it("isolates one recipient's database error from the next", async () => {
    m.pending.mockResolvedValue(
      ["a", "b"].map((userId) => ({
        id: userId,
        userId,
        epoch: 1,
        awardDay: "2026-10-16",
        timeZone: "UTC",
      })),
    );
    m.state.mockRejectedValueOnce(new Error("pool busy"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sweepAchievementMail(10, now)).toEqual({ sent: 1 });
    } finally {
      log.mockRestore();
    }
  });
  it.each(["origin", "transport"])(
    "reconciles uncertain submissions even without %s",
    async (gate) => {
      if (gate === "origin") vi.stubEnv("SITE_URL", "");
      else m.configured = false;
      await sweepAchievementMail(10, now);
      expect(m.claim.mock.calls[0][0]).toMatchObject({
        where: { status: "sending", claimedAt: { lt: new Date(now.getTime() - 600000) } },
        data: { status: "unknown", reason: "delivery_unconfirmed" },
      });
      expect(m.send).not.toHaveBeenCalled();
    },
  );
  it("defers pre-claim failures so later queued recipients can progress", async () => {
    m.token.mockImplementation(() => {
      throw new Error("signing unavailable");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await sweepAchievementMail(10, now);
      expect(m.claim).toHaveBeenCalledWith({
        where: { id: "m", status: "queued" },
        data: { dueAt: new Date(now.getTime() + 21600000), reason: "preparation_failed" },
      });
      expect(m.send).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it("does not put an already claimed recipient back in the send queue", async () => {
    m.eligible.mockRejectedValue(new Error("database read interrupted"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await sweepAchievementMail(10, now);
      expect(m.claim).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reason: "preparation_failed" }),
        }),
      );
      expect(m.send).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
