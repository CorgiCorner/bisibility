import { NotificationType } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendWelcomeFollowupActivity } from "./welcome-email-activity";

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(),
  createToken: vi.fn(),
  deleteNotification: vi.fn(),
  findUnique: vi.fn(),
  founderIdentity: vi.fn(),
  sendFollowup: vi.fn(),
  resolveCanonicalOrigin: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    notification: { delete: mocks.deleteNotification },
    user: { findUnique: mocks.findUnique },
  },
}));
vi.mock("@/lib/notifications/create", () => ({
  createNotification: mocks.createNotification,
}));
vi.mock("@/lib/email/welcome-delivery", () => ({
  prepareWelcomeEmail: vi.fn(),
  sendPreparedWelcomeEmail: vi.fn(),
  sendWelcomeFollowupEmail: mocks.sendFollowup,
}));
vi.mock("@/lib/email/marketing-unsubscribe", () => ({
  createMarketingUnsubscribeToken: mocks.createToken,
}));
vi.mock("@/lib/email/founder-email-identity", () => ({
  resolveFounderEmailIdentity: mocks.founderIdentity,
}));
vi.mock("@/lib/seo/origin", () => ({
  absoluteUrl: (o: string, p: string) => `${o}${p}`,
  resolveCanonicalOrigin: mocks.resolveCanonicalOrigin,
}));

const baseOwner = {
  accounts: [{ providerId: "google" }],
  deactivatedAt: null,
  email: "ada@example.com",
  name: "Ada",
  marketingEmailUnsubscribedAt: null,
  _count: { memberships: 1, projects: 1 },
};

const invitedMember = {
  ...baseOwner,
  _count: { memberships: 1, projects: 0 },
};

describe("welcome follow-up activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(baseOwner);
    mocks.sendFollowup.mockResolvedValue(undefined);
    mocks.createNotification.mockResolvedValue({ id: "ntf_2" });
    mocks.deleteNotification.mockResolvedValue(undefined);
    mocks.createToken.mockReturnValue("token-value");
    mocks.founderIdentity.mockReturnValue({
      founderName: "Ada Lovelace",
      from: "hello@example.com",
      replyTo: "hello@example.com",
    });
    mocks.resolveCanonicalOrigin.mockReturnValue("https://staging.example.com");
  });

  it.each([
    ["missing", null],
    ["deactivated", { ...baseOwner, deactivatedAt: new Date() }],
    ["unsubscribed", { ...baseOwner, marketingEmailUnsubscribedAt: new Date() }],
  ])("skips a %s user before claiming", async (status, row) => {
    mocks.findUnique.mockResolvedValue(row);

    await expect(sendWelcomeFollowupActivity({ userId: "user_1" })).resolves.toEqual({ status });
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendFollowup).not.toHaveBeenCalled();
  });

  it("returns invited_member when the user has memberships but no projects", async () => {
    mocks.findUnique.mockResolvedValue(invitedMember);

    await expect(sendWelcomeFollowupActivity({ userId: "user_1" })).resolves.toEqual({
      status: "invited_member",
    });
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendFollowup).not.toHaveBeenCalled();
  });

  it("selects _count for memberships and projects", async () => {
    await sendWelcomeFollowupActivity({ userId: "user_1" });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      select: {
        accounts: { select: { providerId: true } },
        deactivatedAt: true,
        email: true,
        name: true,
        marketingEmailUnsubscribedAt: true,
        _count: { select: { memberships: true, projects: true } },
      },
      where: { id: "user_1" },
    });
  });

  it("claims with exact type, null project, founder title, body, undefined payload, and key", async () => {
    await sendWelcomeFollowupActivity({ userId: "user_1" });

    expect(mocks.createNotification).toHaveBeenCalledWith(
      "user_1",
      null,
      NotificationType.system,
      "A note from Ada Lovelace",
      "Quick question: what made you sign up, and what were you using before?",
      undefined,
      "founder_checkin_email",
    );
  });

  it("uses the team fallback title when no founder name is configured", async () => {
    mocks.founderIdentity.mockReturnValue({
      founderName: null,
      from: "hello@example.com",
      replyTo: "hello@example.com",
    });

    await sendWelcomeFollowupActivity({ userId: "user_1" });

    expect(mocks.createNotification).toHaveBeenCalledWith(
      "user_1",
      null,
      NotificationType.system,
      "A note from the bisibility team",
      "Quick question: what made you sign up, and what were you using before?",
      undefined,
      "founder_checkin_email",
    );
  });

  it("claims delivery before invoking the mailer", async () => {
    await sendWelcomeFollowupActivity({ userId: "user_1" });

    expect(mocks.createNotification).toHaveBeenCalled();
    expect(mocks.sendFollowup).toHaveBeenCalled();
    expect(mocks.createNotification.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendFollowup.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("skips the mailer when the claim is null", async () => {
    mocks.createNotification.mockResolvedValue(null);

    await expect(sendWelcomeFollowupActivity({ userId: "user_1" })).resolves.toEqual({
      status: "already_sent",
    });
    expect(mocks.sendFollowup).not.toHaveBeenCalled();
  });

  it("deletes the exact claim row and rethrows on send error", async () => {
    const sendError = new Error("provider rejected");
    mocks.sendFollowup.mockRejectedValue(sendError);

    await expect(sendWelcomeFollowupActivity({ userId: "user_1" })).rejects.toBe(sendError);

    expect(mocks.deleteNotification).toHaveBeenCalledWith({ where: { id: "ntf_2" } });
  });

  it("logs a cleanup failure without masking the send error", async () => {
    const sendError = new Error("send failed");
    mocks.sendFollowup.mockRejectedValue(sendError);
    mocks.deleteNotification.mockRejectedValue(new Error("db down"));

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendWelcomeFollowupActivity({ userId: "user_1" })).rejects.toBe(sendError);
    expect(error).toHaveBeenCalledWith("welcome follow-up: failed to release delivery claim");
  });

  it("does not perform an after-send completion write on success", async () => {
    await sendWelcomeFollowupActivity({ userId: "user_1" });

    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    expect(mocks.deleteNotification).not.toHaveBeenCalled();
  });

  it("sends with OAuth name provenance and unsubscribe URL", async () => {
    await sendWelcomeFollowupActivity({ userId: "user_1" });

    expect(mocks.sendFollowup).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        name: "Ada",
        profileNameTrusted: true,
        unsubscribeUrl: "https://staging.example.com/email/unsubscribe?token=token-value",
      }),
    );
  });

  it("builds the unsubscribe token before any claim, leaving no claim on failure", async () => {
    mocks.createToken.mockImplementation(() => {
      throw new Error("secret keyring missing");
    });

    await expect(sendWelcomeFollowupActivity({ userId: "user_1" })).rejects.toThrow(
      "secret keyring missing",
    );

    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendFollowup).not.toHaveBeenCalled();
  });

  it("resolves canonical origin before claiming, leaving no claim on failure", async () => {
    mocks.resolveCanonicalOrigin.mockImplementation(() => {
      throw new Error("origin resolution failed");
    });

    await expect(sendWelcomeFollowupActivity({ userId: "user_1" })).rejects.toThrow(
      "origin resolution failed",
    );

    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendFollowup).not.toHaveBeenCalled();
  });

  it("resolves founder identity before claiming, leaving no claim on failure", async () => {
    mocks.founderIdentity.mockImplementation(() => {
      throw new Error("EMAIL_FROM is required to send email.");
    });

    await expect(sendWelcomeFollowupActivity({ userId: "user_1" })).rejects.toThrow(
      "EMAIL_FROM is required to send email.",
    );

    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendFollowup).not.toHaveBeenCalled();
  });
});
