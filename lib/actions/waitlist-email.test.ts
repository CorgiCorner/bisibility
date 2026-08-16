import type { WaitlistSource } from "@/lib/landing/waitlist-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { joinWaitlist } from "./waitlist";

const mocks = vi.hoisted(() => ({
  prisma: {
    dailySendCounter: { upsert: vi.fn() },
    waitlist: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  revalidatePath: vi.fn(),
  reserveEmailDailyBudget: vi.fn(),
  sesSend: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
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
    process.env.RESEND_CONTACTS_API_KEY = "resend_contacts_test";
    process.env.RESEND_SEGMENT_CLOUD = "segment_cloud";
    process.env.RESEND_SEGMENT_EARLY_ADOPTERS = "segment_early_adopters";
    process.env.RESEND_SEGMENT_GENERAL = "segment_general";
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
    process.env.RESEND_CONTACTS_API_KEY = "";
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

  it("keeps syncing waitlist contacts to Resend segments when SES delivers email", async () => {
    process.env.EMAIL_PROVIDER = "ses";
    process.env.SES_REGION = "eu-central-1";
    mocks.sesSend.mockResolvedValue({});
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "person@example.com",
        source: "cloud_pricing",
      }),
    );

    await joinWaitlist({ cloudPrice: "19", email: "person@example.com", source: "cloud_pricing" });

    const contactsCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/contacts");
    expect(contactsCall).toBeDefined();
    expect(JSON.parse(String(contactsCall?.[1]?.body)).segments).toEqual([{ id: "segment_cloud" }]);
    expect(mocks.sesSend).toHaveBeenCalledOnce();
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

  it("keeps contact sync for non-feedback sources", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "user@example.com",
        source: "cloud_pricing",
      }),
    );

    await joinWaitlist({ cloudPrice: "19", email: "user@example.com", source: "cloud_pricing" });

    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => url === "https://api.resend.com/contacts"),
    ).toBe(true);
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
