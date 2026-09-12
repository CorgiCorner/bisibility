import type { WaitlistSource } from "@/lib/landing/waitlist-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { joinWaitlist } from "./waitlist";

const mocks = vi.hoisted(() => ({
  prisma: {
    dailySendCounter: { upsert: vi.fn() },
    waitlist: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  protection: {
    enforceDistinctNewEmailLimit: vi.fn().mockResolvedValue(undefined),
    enforceHumanVerification: vi.fn().mockResolvedValue(undefined),
    enforceWaitlistRateLimits: vi.fn().mockResolvedValue(undefined),
    hashIdentifier: vi.fn((v: string) => `hash_${v}`),
    resolveClientIdentity: vi
      .fn()
      .mockResolvedValue({ clientDigest: "client-digest", rawIp: null }),
  },
  revalidatePath: vi.fn(),
  reserveEmailDailyBudget: vi.fn(),
  sesSend: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/landing/waitlist-protection", () => ({
  WAITLIST_RATE_LIMITED: "Too many requests. Please try again later.",
  WAITLIST_VERIFICATION_FAILED: "Verification failed. Please try again.",
  enforceDistinctNewEmailLimit: mocks.protection.enforceDistinctNewEmailLimit,
  enforceHumanVerification: mocks.protection.enforceHumanVerification,
  enforceWaitlistRateLimits: mocks.protection.enforceWaitlistRateLimits,
  hashIdentifier: mocks.protection.hashIdentifier,
  resolveClientIdentity: mocks.protection.resolveClientIdentity,
}));
vi.mock("@/lib/email/budget", () => ({
  reserveEmailDailyBudget: mocks.reserveEmailDailyBudget,
}));
vi.mock("@aws-sdk/client-sesv2", () => {
  class SESv2Client {
    send = mocks.sesSend;
  }

  class SendEmailCommand {
    readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  return { SESv2Client, SendEmailCommand };
});

type StoredWaitlist = {
  cloudPrice: string | null;
  email: string;
  hostedPrice: string | null;
  source: WaitlistSource;
  submissions: number;
};

function storedWaitlist(overrides: Partial<StoredWaitlist> = {}) {
  return {
    cloudPrice: null,
    email: "person@example.com",
    hostedPrice: null,
    source: "landing_capture",
    submissions: 1,
    ...overrides,
  };
}

describe("joinWaitlist email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_FROM = "bisibility <notifications@example.com>";
    process.env.SES_REGION = "";
    process.env.RESEND_API_KEY = "resend_test";
    process.env.WAITLIST_NOTIFY_EMAIL = "owner@example.com";
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    mocks.prisma.waitlist.upsert.mockResolvedValue(storedWaitlist());
    mocks.prisma.waitlist.findUnique.mockResolvedValue(null);
    mocks.reserveEmailDailyBudget.mockResolvedValue({
      day: new Date("2026-07-23T00:00:00.000Z"),
      granted: true,
      limit: 1_000,
      notificationDue: false,
    });
  });

  it("persists without email delivery when no provider is configured", async () => {
    process.env.EMAIL_PROVIDER = "";
    process.env.RESEND_API_KEY = "";
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "log@example.com", source: "landing_capture" }),
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await joinWaitlist({ email: "log@example.com", source: "landing_capture" });

    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("[waitlist] Email: log@example.com"));
    info.mockRestore();
  });

  it("notifies the owner through Amazon SES when selected without Resend", async () => {
    process.env.RESEND_API_KEY = "";
    process.env.EMAIL_PROVIDER = "ses";
    process.env.SES_REGION = "eu-central-1";
    mocks.sesSend.mockResolvedValue({});
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "person@example.com", source: "landing_capture" }),
    );

    await joinWaitlist({ email: "person@example.com", source: "landing_capture" });

    expect(mocks.sesSend).toHaveBeenCalledOnce();
    expect(mocks.sesSend.mock.calls[0]?.[0]?.input).toMatchObject({
      Content: {
        Simple: { Subject: { Data: "bisibility waitlist: person@example.com" } },
      },
      Destination: { ToAddresses: ["owner@example.com"] },
    });
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => url === "https://api.resend.com/emails"),
    ).toBe(false);
  });

  it("derives the notify recipient from EMAIL_FROM when no explicit recipient is set", async () => {
    process.env.WAITLIST_NOTIFY_EMAIL = "";
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "person@example.com", source: "landing_capture" }),
    );

    await joinWaitlist({ email: "person@example.com", source: "landing_capture" });

    const notifyCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/emails");
    expect(notifyCall).toBeDefined();
    expect(JSON.parse(String(notifyCall?.[1]?.body)).to).toEqual(["notifications@example.com"]);
  });

  it("keeps the cloud-price detail for non-feedback notifications", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "user@example.com",
        source: "cloud_pricing",
      }),
    );

    await joinWaitlist({ cloudPrice: "19", email: "user@example.com", source: "cloud_pricing" });

    const emailCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/emails");
    expect(emailCall).toBeDefined();
    const payload = JSON.parse(String(emailCall?.[1]?.body));
    expect(payload.text).toContain("Hosted price: $19/mo");
    expect(payload.subject).toBe("bisibility waitlist: user@example.com");
  });
});
