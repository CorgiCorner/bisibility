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

describe("joinWaitlist settings feedback", () => {
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

  it("preserves existing source and cloudPrice for settings feedback on update", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({ source: "cloud_pricing" });
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "user@example.com",
        hostedPrice: "$25/mo",
        source: "cloud_pricing",
        submissions: 2,
      }),
    );

    await joinWaitlist({
      cloudPrice: "custom",
      cloudPriceCustom: "25",
      email: "user@example.com",
      source: "settings_feedback",
    });

    const call = mocks.prisma.waitlist.upsert.mock.calls[0]?.[0];
    expect(call.update).not.toHaveProperty("source");
    expect(call.update).not.toHaveProperty("cloudPrice");
    expect(call.update).toEqual({
      hostedPrice: "$25/mo",
      hostedPriceAnsweredAt: expect.any(Date),
      lastSubmittedAt: expect.any(Date),
      submissions: { increment: 1 },
    });
    expect(call.create).toEqual({
      cloudPrice: null,
      email: "user@example.com",
      hostedPrice: "$25/mo",
      hostedPriceAnsweredAt: expect.any(Date),
      lastSubmittedAt: expect.any(Date),
      source: "settings_feedback",
    });
  });

  it("preserves a landing row's source and cloudPrice when settings feedback arrives", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({ source: "landing_capture" });
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: null,
        email: "visitor@example.com",
        hostedPrice: "$39/mo",
        source: "landing_capture",
        submissions: 2,
      }),
    );

    await joinWaitlist({
      cloudPrice: "39",
      email: "visitor@example.com",
      source: "settings_feedback",
    });

    const call = mocks.prisma.waitlist.upsert.mock.calls[0]?.[0];
    expect(call.update).not.toHaveProperty("source");
    expect(call.update).not.toHaveProperty("cloudPrice");
    expect(call.update).toEqual({
      hostedPrice: "$39/mo",
      hostedPriceAnsweredAt: expect.any(Date),
      lastSubmittedAt: expect.any(Date),
      submissions: { increment: 1 },
    });
  });

  it("preserves an existing settings-feedback row when a different non-feedback source arrives", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({ source: "settings_feedback" });
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$25/mo",
        email: "user@example.com",
        hostedPrice: "$25/mo",
        source: "settings_feedback",
        submissions: 3,
      }),
    );

    await joinWaitlist({
      cloudPrice: "19",
      email: "user@example.com",
      source: "cloud_pricing",
    });

    const call = mocks.prisma.waitlist.upsert.mock.calls[0]?.[0];
    expect(call.update).not.toHaveProperty("source");
    expect(call.update).not.toHaveProperty("cloudPrice");
    expect(call.update).not.toHaveProperty("hostedPrice");
    expect(call.update).not.toHaveProperty("hostedPriceAnsweredAt");
    expect(call.update).toEqual({
      lastSubmittedAt: expect.any(Date),
      submissions: { increment: 1 },
    });

    const emailCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/emails");
    expect(emailCall).toBeDefined();
    const emailPayload = JSON.parse(String(emailCall?.[1]?.body));
    expect(emailPayload.text).toContain("Hosted price: $19/mo");
    expect(emailPayload.text).not.toContain("Feedback price:");

    const contactsCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/contacts");
    expect(contactsCall).toBeDefined();
    const contactsPayload = JSON.parse(String(contactsCall?.[1]?.body));
    expect(contactsPayload.properties).toMatchObject({
      cloud_price: "$19/mo",
      source: "cloud_pricing",
    });
  });

  it("refreshes cloudPrice on a same-source resubmission", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({ source: "cloud_pricing" });
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$39/mo",
        email: "user@example.com",
        source: "cloud_pricing",
      }),
    );

    await joinWaitlist({ cloudPrice: "39", email: "user@example.com", source: "cloud_pricing" });

    const call = mocks.prisma.waitlist.upsert.mock.calls[0]?.[0];
    expect(call.update).toEqual({
      cloudPrice: "$39/mo",
      lastSubmittedAt: expect.any(Date),
      source: "cloud_pricing",
      submissions: { increment: 1 },
    });
  });

  it("skips marketing contact sync for settings feedback", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "user@example.com",
        hostedPrice: "$25/mo",
        source: "settings_feedback",
      }),
    );

    await joinWaitlist({
      cloudPrice: "custom",
      cloudPriceCustom: "25",
      email: "user@example.com",
      source: "settings_feedback",
    });

    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => url === "https://api.resend.com/contacts"),
    ).toBe(false);
  });

  it("sends feedback-specific email copy for settings feedback", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "user@example.com",
        hostedPrice: "$30/mo",
        source: "settings_feedback",
      }),
    );

    await joinWaitlist({
      cloudPrice: "custom",
      cloudPriceCustom: "30",
      email: "user@example.com",
      source: "settings_feedback",
    });

    const emailCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/emails");
    expect(emailCall).toBeDefined();
    const payload = JSON.parse(String(emailCall?.[1]?.body));
    expect(payload.subject).toBe("bisibility pricing feedback: user@example.com");
    expect(payload.html).toContain("New pricing feedback from settings.");
    expect(payload.text).toContain("Feedback price: $30/mo");
    // Settings feedback shows only the dedicated hostedPrice; the preserved
    // cloudPrice is not a current feedback answer and must not appear.
    expect(payload.text).not.toContain("Hosted price:");
    // Settings feedback copy must never mention the waitlist wording.
    expect(payload.text).not.toMatch(/waitlist/i);
    expect(payload.html).not.toMatch(/waitlist/i);
    expect(payload.subject).not.toMatch(/waitlist/i);
  });
});
