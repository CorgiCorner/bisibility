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

describe("joinWaitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.protection.enforceDistinctNewEmailLimit.mockResolvedValue(undefined);
    mocks.protection.enforceHumanVerification.mockResolvedValue(undefined);
    mocks.protection.enforceWaitlistRateLimits.mockResolvedValue(undefined);
    mocks.protection.resolveClientIdentity.mockResolvedValue({
      clientDigest: "client-digest",
      rawIp: null,
    });
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

    expect(result).toEqual({ changed: true, email: "person@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith({
      create: {
        cloudPrice: "$19/mo",
        email: "person@example.com",
        hostedPrice: null,
        hostedPriceAnsweredAt: null,
        lastSubmittedAt: expect.any(Date),
        prefersUsagePricing: false,
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
        prefersUsagePricing: false,
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

    expect(result).toEqual({ changed: true, email: "buyer@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ cloudPrice: "$123/mo" }),
        update: expect.objectContaining({ cloudPrice: "$123/mo" }),
      }),
    );
  });

  it("accepts a checked usage-preference checkbox from FormData", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "buyer@example.com",
        source: "cloud_pricing",
      }),
    );
    const formData = new FormData();
    formData.set("cloudPrice", "19");
    formData.set("email", "Buyer@Example.com");
    formData.set("prefersUsagePricing", "on");
    formData.set("source", "cloud_pricing");

    const result = await joinWaitlist(formData);

    expect(result).toEqual({ changed: true, email: "buyer@example.com", ok: true });
    const call = mocks.prisma.waitlist.upsert.mock.calls[0][0];
    expect(call.create).toEqual(
      expect.objectContaining({ prefersUsagePricing: true, email: "buyer@example.com" }),
    );
    expect(call.where).toEqual({ email: "buyer@example.com" });
  });

  it("keeps the email when the usage-preference checkbox is absent from FormData", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "buyer@example.com",
        source: "cloud_pricing",
      }),
    );
    const formData = new FormData();
    formData.set("cloudPrice", "19");
    formData.set("email", "Buyer@Example.com");
    formData.set("source", "cloud_pricing");

    const result = await joinWaitlist(formData);

    expect(result).toEqual({ changed: true, email: "buyer@example.com", ok: true });
    const call = mocks.prisma.waitlist.upsert.mock.calls[0][0];
    expect(call.create).toEqual(
      expect.objectContaining({ prefersUsagePricing: false, email: "buyer@example.com" }),
    );
    expect(call.where).toEqual({ email: "buyer@example.com" });
  });

  it("stores cloud-waitlist signups without notifying and keeps any stored price", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "wait@example.com", source: "cloud_waitlist" }),
    );

    const result = await joinWaitlist({ email: "Wait@Example.com", source: "cloud_waitlist" });

    expect(result).toEqual({ changed: true, email: "wait@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ cloudPrice: null }),
        update: expect.objectContaining({ cloudPrice: undefined }),
      }),
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

    expect(result).toEqual({ changed: true, email: "team@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ cloudPrice: "$25/mo", source: "settings_notify" }),
      }),
    );
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => url === "https://api.resend.com/emails"),
    ).toBe(true);
  });

  it("rejects personal email for featured-company submissions before writing", async () => {
    await expect(
      joinWaitlist({ email: "person@gmail.com", source: "featured_company" }),
    ).rejects.toThrow("Use your work email.");

    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
  });

  it("passes a usage-pricing preference through the cloud_pricing upsert", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "buyer@example.com",
        source: "cloud_pricing",
      }),
    );

    await joinWaitlist({
      cloudPrice: "19",
      email: "buyer@example.com",
      prefersUsagePricing: true,
      source: "cloud_pricing",
    });

    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ prefersUsagePricing: true }),
        update: expect.objectContaining({ prefersUsagePricing: true }),
      }),
    );
  });

  it("defaults prefersUsagePricing to false when omitted on cloud_pricing create", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$39/mo",
        email: "buyer@example.com",
        source: "cloud_pricing",
      }),
    );

    await joinWaitlist({
      cloudPrice: "39",
      email: "buyer@example.com",
      source: "cloud_pricing",
    });

    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ prefersUsagePricing: false }),
      }),
    );
  });

  it("records a cloud_pricing opinion on a row owned by another source without rewriting source", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({
      source: "landing_capture",
    });
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "buyer@example.com", source: "landing_capture", submissions: 2 }),
    );

    await joinWaitlist({
      cloudPrice: "19",
      email: "buyer@example.com",
      prefersUsagePricing: true,
      source: "cloud_pricing",
    });

    const call = mocks.prisma.waitlist.upsert.mock.calls[0][0];
    const update = call.update;
    // cloudPrice and prefersUsagePricing persist (an opinion, not attribution);
    // source is left untouched on the stored row.
    expect(update).not.toHaveProperty("source");
    expect(update).toEqual({
      cloudPrice: "$19/mo",
      lastSubmittedAt: expect.any(Date),
      prefersUsagePricing: true,
      submissions: { increment: 1 },
    });
  });

  it("does not leak a cloud_pricing opinion back when a landing_capture submission follows it", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({
      source: "cloud_pricing",
    });
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "buyer@example.com", source: "cloud_pricing", submissions: 3 }),
    );

    await joinWaitlist({ email: "buyer@example.com", source: "landing_capture" });

    const call = mocks.prisma.waitlist.upsert.mock.calls[0][0];
    const update = call.update;
    // landing_capture is not a price-carrying source and must not touch the
    // stored cloudPrice or prefersUsagePricing from the prior cloud_pricing
    // vote; only bookkeeping columns move.
    expect(update).not.toHaveProperty("cloudPrice");
    expect(update).not.toHaveProperty("prefersUsagePricing");
    expect(update).not.toHaveProperty("source");
    expect(update).toEqual({
      lastSubmittedAt: expect.any(Date),
      submissions: { increment: 1 },
    });
  });

  it("writes false on create for landing_capture and omits the field from update", async () => {
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({ email: "person@example.com", source: "landing_capture" }),
    );

    await joinWaitlist({ email: "person@example.com", source: "landing_capture" });

    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ prefersUsagePricing: false }),
        update: expect.objectContaining({ prefersUsagePricing: undefined }),
      }),
    );
  });

  it("rejects before any DB operation when rate limits are exceeded", async () => {
    mocks.protection.enforceWaitlistRateLimits.mockRejectedValueOnce(
      new Error("Too many requests. Please try again later."),
    );

    await expect(
      joinWaitlist({ email: "rate@example.com", source: "landing_capture" }),
    ).rejects.toThrow("Too many requests. Please try again later.");

    expect(mocks.prisma.waitlist.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
  });

  it("rejects before upsert when the distinct-new-email limit is exceeded", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue(null);
    mocks.protection.enforceDistinctNewEmailLimit.mockRejectedValueOnce(
      new Error("Too many requests. Please try again later."),
    );

    await expect(
      joinWaitlist({ email: "new@example.com", source: "landing_capture" }),
    ).rejects.toThrow("Too many requests. Please try again later.");

    expect(mocks.prisma.waitlist.findUnique).toHaveBeenCalledOnce();
    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
  });

  it("rejects before DB access when human verification fails", async () => {
    mocks.protection.enforceHumanVerification.mockRejectedValueOnce(
      new Error("Verification failed. Please try again."),
    );

    await expect(
      joinWaitlist({ email: "unverified@example.com", source: "cloud_pricing", cloudPrice: "19" }),
    ).rejects.toThrow("Verification failed. Please try again.");

    expect(mocks.prisma.waitlist.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
  });

  it("returns changed false for unchanged cloud_pricing resubmit without any side effects", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({
      cloudPrice: "$19/mo",
      prefersUsagePricing: false,
      source: "cloud_pricing",
    });

    const result = await joinWaitlist({
      cloudPrice: "19",
      email: "buyer@example.com",
      source: "cloud_pricing",
    });

    expect(result).toEqual({ changed: false, email: "buyer@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => url === "https://api.resend.com/emails"),
    ).toBe(false);
  });

  it("returns changed true and upserts when the cloud price differs", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({
      cloudPrice: "$19/mo",
      prefersUsagePricing: false,
      source: "cloud_pricing",
    });
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$39/mo",
        email: "buyer@example.com",
        source: "cloud_pricing",
      }),
    );

    const result = await joinWaitlist({
      cloudPrice: "39",
      email: "buyer@example.com",
      source: "cloud_pricing",
    });

    expect(result).toEqual({ changed: true, email: "buyer@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledOnce();
  });

  it("returns changed true and upserts when the usage preference differs", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({
      cloudPrice: "$19/mo",
      prefersUsagePricing: false,
      source: "cloud_pricing",
    });
    mocks.prisma.waitlist.upsert.mockResolvedValue(
      storedWaitlist({
        cloudPrice: "$19/mo",
        email: "buyer@example.com",
        source: "cloud_pricing",
      }),
    );

    const result = await joinWaitlist({
      cloudPrice: "19",
      email: "buyer@example.com",
      prefersUsagePricing: true,
      source: "cloud_pricing",
    });

    expect(result).toEqual({ changed: true, email: "buyer@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).toHaveBeenCalledOnce();
  });

  it("is idempotent for a cross-source row with the same pricing opinion", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue({
      cloudPrice: "$19/mo",
      prefersUsagePricing: true,
      source: "landing_capture",
    });

    const result = await joinWaitlist({
      cloudPrice: "19",
      email: "buyer@example.com",
      prefersUsagePricing: true,
      source: "cloud_pricing",
    });

    expect(result).toEqual({ changed: false, email: "buyer@example.com", ok: true });
    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
  });

  it("never passes verification token or raw IP into Prisma payloads", async () => {
    mocks.protection.resolveClientIdentity.mockResolvedValueOnce({
      clientDigest: "client-digest",
      rawIp: "203.0.113.42",
    });

    await joinWaitlist({
      cloudPrice: "19",
      email: "buyer@example.com",
      source: "cloud_pricing",
      verificationToken: "secret-token-abc",
    });

    const allCalls = mocks.prisma.waitlist.upsert.mock.calls.map((call) => JSON.stringify(call[0]));
    for (const serialized of allCalls) {
      expect(serialized).not.toContain("secret-token-abc");
      expect(serialized).not.toContain("203.0.113.42");
    }
  });
});
