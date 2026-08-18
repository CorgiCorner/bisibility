import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  resolveFounderEmailIdentity: vi.fn(),
  welcomeEmail: vi.fn(),
  welcomeFollowupEmail: vi.fn(),
}));

vi.mock("./send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("./founder-email-identity", () => ({
  resolveFounderEmailIdentity: mocks.resolveFounderEmailIdentity,
}));
vi.mock("./welcome-template", () => ({
  welcomeEmail: mocks.welcomeEmail,
  welcomeFollowupEmail: mocks.welcomeFollowupEmail,
}));

import {
  prepareWelcomeEmail,
  sendPreparedWelcomeEmail,
  sendWelcomeFollowupEmail,
} from "./welcome-delivery";

const identity = {
  founderName: "Ada" as string | null,
  from: "ada@example.com",
  replyTo: "replies@example.com",
};

const welcomeMessage = {
  from: "ada@example.com",
  html: "<html>",
  replyTo: "replies@example.com",
  subject: "Welcome to bisibility Cloud",
  text: "Welcome",
};

const followupMessage = {
  from: "ada@example.com",
  html: "<html>",
  replyTo: "replies@example.com",
  subject: "what made you try bisibility?",
  text: "Question",
};

const recipient = {
  email: "owner@example.com",
  name: "Owner",
  profileNameTrusted: true,
  variant: "completed" as const,
};

describe("welcome email delivery categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.resolveFounderEmailIdentity.mockReturnValue(identity);
    mocks.welcomeEmail.mockReturnValue(welcomeMessage);
    mocks.welcomeFollowupEmail.mockReturnValue(followupMessage);
  });

  it("pins Email 1 to transactional", async () => {
    const prepared = prepareWelcomeEmail(recipient, "https://cloud.example.com");
    expect(prepared.category).toBe("transactional");

    await sendPreparedWelcomeEmail(prepared);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ category: "transactional" }),
    );
  });

  it("pins Email 2 to bulk", async () => {
    await sendWelcomeFollowupEmail({
      email: "owner@example.com",
      name: "Owner",
      profileNameTrusted: true,
      unsubscribeUrl: "https://cloud.example.com/email/unsubscribe?token=signed",
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ category: "bulk" }));
  });

  it("does not call sendEmail during preparation", () => {
    prepareWelcomeEmail(recipient, "https://cloud.example.com");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe("welcome email prepare/send boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.resolveFounderEmailIdentity.mockReturnValue(identity);
    mocks.welcomeEmail.mockReturnValue(welcomeMessage);
  });

  it("prepares the complete message with identity and recipient before send", () => {
    const prepared = prepareWelcomeEmail(recipient, "https://cloud.example.com");

    expect(mocks.resolveFounderEmailIdentity).toHaveBeenCalledOnce();
    expect(mocks.welcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        name: "Owner",
        profileNameTrusted: true,
        variant: "completed",
        from: "ada@example.com",
        replyTo: "replies@example.com",
        founderName: "Ada",
        origin: "https://cloud.example.com",
      }),
    );
    expect(prepared).toEqual({
      category: "transactional",
      from: "ada@example.com",
      html: "<html>",
      replyTo: "replies@example.com",
      subject: "Welcome to bisibility Cloud",
      text: "Welcome",
      to: "owner@example.com",
    });
  });

  it("sendPreparedWelcomeEmail passes the prepared message to the transport", async () => {
    const prepared = prepareWelcomeEmail(recipient, "https://cloud.example.com");
    await sendPreparedWelcomeEmail(prepared);

    expect(mocks.sendEmail).toHaveBeenCalledWith(prepared);
  });

  it("propagates transport errors from sendPreparedWelcomeEmail", async () => {
    const error = new Error("provider rejected");
    mocks.sendEmail.mockRejectedValue(error);

    await expect(
      sendPreparedWelcomeEmail(prepareWelcomeEmail(recipient, "https://cloud.example.com")),
    ).rejects.toBe(error);
  });
});
