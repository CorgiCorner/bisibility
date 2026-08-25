import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  headers: vi.fn(),
  prisma: {
    waitlist: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  revalidatePath: vi.fn(),
  resolveClientIp: vi.fn(),
  sendEmail: vi.fn(),
  syncWaitlistContact: vi.fn(),
  verifyHumanChallenge: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: () => "cloud" }));
vi.mock("@/lib/email/from", () => ({ configuredEmailFrom: () => "sender@example.com" }));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: () => true }));
vi.mock("@/lib/email/resend-contacts", () => ({
  syncWaitlistContact: mocks.syncWaitlistContact,
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/http/client-ip", () => ({ resolveClientIp: mocks.resolveClientIp }));
vi.mock("@/lib/verification/human-verification", () => ({
  verifyHumanChallenge: mocks.verifyHumanChallenge,
}));

const { joinWaitlist } = await import("./waitlist");

describe("joinWaitlist verification order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.resolveClientIp.mockReturnValue("192.0.2.10");
    mocks.verifyHumanChallenge.mockResolvedValue({ code: "verification_failed", success: false });
    mocks.consume.mockResolvedValue({
      limit: 5,
      remaining: 4,
      resetAt: Date.now() + 60_000,
      success: true,
    });
  });

  it("returns verification_failed before every persistence or side effect", async () => {
    await expect(
      joinWaitlist({
        cloudPrice: "19",
        email: "blocked@example.com",
        source: "cloud_pricing",
        verificationToken: "rejected-token",
      }),
    ).resolves.toEqual({ code: "verification_failed", ok: false });

    expect(mocks.headers).toHaveBeenCalledOnce();
    expect(mocks.verifyHumanChallenge).toHaveBeenCalledWith(
      "rejected-token",
      "192.0.2.10",
      expect.any(String),
    );
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.prisma.waitlist.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
    expect(mocks.syncWaitlistContact).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns rate_limited before persistence when a protection bucket is exhausted", async () => {
    mocks.verifyHumanChallenge.mockResolvedValue({ success: true });
    mocks.consume.mockResolvedValue({
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      success: false,
    });

    await expect(
      joinWaitlist({
        email: "blocked@example.com",
        source: "landing_capture",
        verificationToken: "valid-token",
      }),
    ).resolves.toEqual({ code: "rate_limited", ok: false });

    expect(mocks.verifyHumanChallenge.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.consume.mock.invocationCallOrder[0],
    );
    expect(mocks.prisma.waitlist.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.waitlist.upsert).not.toHaveBeenCalled();
  });

  it("returns a typed pre-verification rate limit without normal bucket consumption", async () => {
    mocks.verifyHumanChallenge.mockResolvedValue({ code: "rate_limited", success: false });

    await expect(
      joinWaitlist({
        email: "blocked@example.com",
        source: "landing_capture",
        verificationToken: "valid-token",
      }),
    ).resolves.toEqual({ code: "rate_limited", ok: false });

    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.prisma.waitlist.findUnique).not.toHaveBeenCalled();
  });

  it("still throws unexpected protection failures", async () => {
    mocks.verifyHumanChallenge.mockRejectedValue(new Error("verification backend unavailable"));

    await expect(
      joinWaitlist({ email: "blocked@example.com", source: "landing_capture" }),
    ).rejects.toThrow("verification backend unavailable");
  });
});
