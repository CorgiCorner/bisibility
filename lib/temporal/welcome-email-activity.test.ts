import { NotificationType } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendWelcomeEmailActivity } from "./welcome-email-activity";

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(),
  deleteNotification: vi.fn(),
  findUnique: vi.fn(),
  prepareWelcome: vi.fn(),
  sendPrepared: vi.fn(),
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
  prepareWelcomeEmail: mocks.prepareWelcome,
  sendPreparedWelcomeEmail: mocks.sendPrepared,
  sendWelcomeFollowupEmail: vi.fn(),
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
  _count: { memberships: 1, projects: 1 },
  projects: [{ id: "prj_1" }],
};

const invitedMember = {
  ...baseOwner,
  _count: { memberships: 1, projects: 0 },
  projects: [],
};

const orphanSignup = {
  ...baseOwner,
  _count: { memberships: 0, projects: 0 },
  projects: [],
};

describe("sendWelcomeEmailActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(baseOwner);
    mocks.prepareWelcome.mockReturnValue({
      category: "transactional",
      from: "hello@example.com",
      html: "<html>",
      replyTo: "replies@example.com",
      subject: "Welcome to bisibility Cloud",
      text: "Welcome",
      to: "ada@example.com",
    });
    mocks.sendPrepared.mockResolvedValue(undefined);
    mocks.createNotification.mockResolvedValue({ id: "ntf_1" });
    mocks.deleteNotification.mockResolvedValue(undefined);
    mocks.resolveCanonicalOrigin.mockReturnValue("https://cloud.example.com");
  });

  it.each([
    ["missing", null],
    ["deactivated", { ...baseOwner, deactivatedAt: new Date() }],
  ])("skips a %s user before claiming", async (status, row) => {
    mocks.findUnique.mockResolvedValue(row);

    await expect(sendWelcomeEmailActivity({ userId: "user_1" })).resolves.toEqual({ status });
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendPrepared).not.toHaveBeenCalled();
  });

  it("returns invited_member when the user has memberships but no projects", async () => {
    mocks.findUnique.mockResolvedValue(invitedMember);

    await expect(sendWelcomeEmailActivity({ userId: "user_1" })).resolves.toEqual({
      status: "invited_member",
    });
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendPrepared).not.toHaveBeenCalled();
  });

  it("selects _count for memberships and projects plus one completed project", async () => {
    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      select: {
        accounts: { select: { providerId: true } },
        deactivatedAt: true,
        email: true,
        name: true,
        _count: { select: { memberships: true, projects: true } },
        projects: {
          where: { onboardingCompletedAt: { not: null } },
          select: { id: true },
          take: 1,
        },
      },
      where: { id: "user_1" },
    });
  });

  it("selects variant completed when a completed project exists", async () => {
    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.prepareWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "completed" }),
      "https://cloud.example.com",
    );
  });

  it("selects variant incomplete when no completed project exists", async () => {
    mocks.findUnique.mockResolvedValue({ ...baseOwner, projects: [] });

    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.prepareWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "incomplete" }),
      "https://cloud.example.com",
    );
  });

  it("selects variant incomplete for an orphan signup with no workspaces or memberships", async () => {
    mocks.findUnique.mockResolvedValue(orphanSignup);

    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.prepareWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "incomplete" }),
      "https://cloud.example.com",
    );
  });

  it("claims with exact type, null project, title, body, payload, and key for completed", async () => {
    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.createNotification).toHaveBeenCalledWith(
      "user_1",
      null,
      NotificationType.system,
      "Welcome to bisibility Cloud",
      "Your first check is a baseline. Let it run for a week or two while history builds.",
      { variant: "completed" },
      "welcome_email",
    );
  });

  it("claims with the incomplete body for an orphan signup", async () => {
    mocks.findUnique.mockResolvedValue(orphanSignup);

    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.createNotification).toHaveBeenCalledWith(
      "user_1",
      null,
      NotificationType.system,
      "Welcome to bisibility Cloud",
      "Setup did not get all the way through, but nothing is lost. Pick it up in bisibility Cloud.",
      { variant: "incomplete" },
      "welcome_email",
    );
  });

  it("claims delivery before invoking the mailer", async () => {
    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.createNotification).toHaveBeenCalled();
    expect(mocks.sendPrepared).toHaveBeenCalled();
    expect(mocks.createNotification.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendPrepared.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("skips the mailer when the claim is null", async () => {
    mocks.createNotification.mockResolvedValue(null);

    await expect(sendWelcomeEmailActivity({ userId: "user_1" })).resolves.toEqual({
      status: "already_sent",
    });
    expect(mocks.sendPrepared).not.toHaveBeenCalled();
  });

  it("sends to a marketing-unsubscribed user (transactional)", async () => {
    mocks.findUnique.mockResolvedValue({
      ...baseOwner,
      marketingEmailUnsubscribedAt: new Date(),
      projects: [],
    });

    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.sendPrepared).toHaveBeenCalled();
  });

  it("deletes the exact claim row and rethrows on send error", async () => {
    const sendError = new Error("provider rejected");
    mocks.sendPrepared.mockRejectedValue(sendError);

    await expect(sendWelcomeEmailActivity({ userId: "user_1" })).rejects.toBe(sendError);

    expect(mocks.deleteNotification).toHaveBeenCalledWith({ where: { id: "ntf_1" } });
  });

  it("logs a cleanup failure without masking the send error", async () => {
    const sendError = new Error("send failed");
    mocks.sendPrepared.mockRejectedValue(sendError);
    mocks.deleteNotification.mockRejectedValue(new Error("db down"));

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendWelcomeEmailActivity({ userId: "user_1" })).rejects.toBe(sendError);
    expect(error).toHaveBeenCalledWith("welcome email: failed to release delivery claim");
  });

  it("does not perform an after-send completion write on success", async () => {
    await sendWelcomeEmailActivity({ userId: "user_1" });

    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    expect(mocks.deleteNotification).not.toHaveBeenCalled();
  });

  it("resolves canonical origin before claiming, leaving no claim on failure", async () => {
    mocks.resolveCanonicalOrigin.mockImplementation(() => {
      throw new Error("origin resolution failed");
    });

    await expect(sendWelcomeEmailActivity({ userId: "user_1" })).rejects.toThrow(
      "origin resolution failed",
    );

    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendPrepared).not.toHaveBeenCalled();
  });

  it("does not claim or send when message preparation throws", async () => {
    mocks.prepareWelcome.mockImplementation(() => {
      throw new Error("template build failed");
    });

    await expect(sendWelcomeEmailActivity({ userId: "user_1" })).rejects.toThrow(
      "template build failed",
    );

    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.sendPrepared).not.toHaveBeenCalled();
  });
});
