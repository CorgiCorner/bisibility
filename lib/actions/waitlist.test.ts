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

describe("joinWaitlist", () => {
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

  it("stores a normalized email and notifies the owner", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "person@example.com",
        source: "cloud_pricing",
      }),
    );

    const result = await joinWaitlist({
      cloudPrice: "19",
      email: "Person@Example.com",
      source: "cloud_pricing",
    });

    expect(result).toEqual({ email: "person@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith({
      create: {
        cloudPrice: "$19/mo",
        email: "person@example.com",
        hostedPrice: null,
        hostedPriceAnsweredAt: null,
        lastSubmittedAt: expect.any(Date),
        source: "cloud_pricing",
      },
      select: {
        cloudPrice: true,
        email: true,
        hostedPrice: true,
        source: true,
        submissions: true,
      },
      update: {
        cloudPrice: "$19/mo",
        lastSubmittedAt: expect.any(Date),
        source: "cloud_pricing",
        submissions: { increment: 1 },
      },
      where: { email: "person@example.com" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    const emailCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/emails");
    const payload = JSON.parse(String(emailCall?.[1]?.body));
    expect(payload.text).toContain("Hosted price: $19/mo");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("increments submissions on repeat email without writing verification rows", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "repeat@example.com", source: "landing_capture", submissions: 3 }),
    );

    await joinWaitlist({ email: "repeat@example.com", source: "landing_capture" });

    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ submissions: { increment: 1 } }),
        where: { email: "repeat@example.com" },
      }),
    );
    const emailCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/emails");
    const payload = JSON.parse(String(emailCall?.[1]?.body));
    expect(payload.text).toContain("Submissions: 3");
  });

  it("accepts FormData and stores a custom cloud price", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$123/mo",
        email: "buyer@example.com",
        source: "cloud_pricing",
      }),
    );
    const formData = new FormData();
    formData.set("cloudPrice", "custom");
    formData.set("cloudPriceCustom", "123");
    formData.set("email", "Buyer@Example.com");
    formData.set("source", "cloud_pricing");

    const result = await joinWaitlist(formData);

    expect(result).toEqual({ email: "buyer@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ cloudPrice: "$123/mo" }),
        update: expect.objectContaining({ cloudPrice: "$123/mo" }),
      }),
    );
  });

  it("stores cloud-waitlist signups without notifying and keeps any stored price", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "wait@example.com", source: "cloud_waitlist" }),
    );

    const result = await joinWaitlist({ email: "Wait@Example.com", source: "cloud_waitlist" });

    expect(result).toEqual({ email: "wait@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ cloudPrice: null }),
        update: expect.objectContaining({ cloudPrice: undefined }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/contacts",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => url === "https://api.resend.com/emails"),
    ).toBe(false);
  });

  it("stores settings billing interest with a price and notifies the owner", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$25/mo",
        email: "team@example.com",
        source: "settings_notify",
      }),
    );

    const result = await joinWaitlist({
      cloudPrice: "custom",
      cloudPriceCustom: "25",
      email: "Team@Example.com",
      source: "settings_notify",
    });

    expect(result).toEqual({ email: "team@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ cloudPrice: "$25/mo", source: "settings_notify" }),
      }),
    );
    const contactCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/contacts");
    const payload = JSON.parse(String(contactCall?.[1]?.body));
    expect(payload).toMatchObject({ segments: [{ id: "segment_cloud" }] });
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => url === "https://api.resend.com/emails"),
    ).toBe(true);
  });

  it("syncs featured companies into the early-adopters segment", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "founder@company.com", source: "featured_company" }),
    );

    await joinWaitlist({ email: "founder@company.com", source: "featured_company" });

    const contactCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "https://api.resend.com/contacts");
    const payload = JSON.parse(String(contactCall?.[1]?.body));
    expect(payload).toMatchObject({
      properties: { source: "featured_company" },
      segments: [{ id: "segment_early_adopters" }],
    });
  });

  it("rejects personal email for featured-company submissions before writing", async () => {
    await expect(
      joinWaitlist({ email: "person@gmail.com", source: "featured_company" }),
    ).rejects.toThrow("Use your work email.");

    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
  });
});
