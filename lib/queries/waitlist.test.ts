import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPricingFeedbackRow, normalizeWaitlistEmail } from "./waitlist";

const mocks = vi.hoisted(() => ({
  prisma: {
    waitlist: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const selectClause = { hostedPriceAnsweredAt: true, source: true };

describe("getPricingFeedbackRow", () => {
  it("shares the canonical waitlist email normalization", () => {
    expect(normalizeWaitlistEmail(" Person@Example.COM ")).toBe("person@example.com");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.waitlist.findUnique.mockResolvedValue(null);
  });

  it("returns null when no waitlist row exists", async () => {
    mocks.prisma.waitlist.findUnique.mockResolvedValue(null);

    const result = await getPricingFeedbackRow("nobody@example.com");

    expect(result).toBeNull();
    expect(mocks.prisma.waitlist.findUnique).toHaveBeenCalledWith({
      select: selectClause,
      where: { email: "nobody@example.com" },
    });
  });

  it("returns the answered-state columns for an existing row", async () => {
    const row = {
      hostedPriceAnsweredAt: new Date("2026-08-15T21:00:00.000Z"),
      source: "settings_feedback",
    };
    mocks.prisma.waitlist.findUnique.mockResolvedValue(row);

    const result = await getPricingFeedbackRow("user@example.com");

    expect(result).toEqual(row);
  });

  it("normalizes the email before querying", async () => {
    await getPricingFeedbackRow("  Mixed@Example.COM  ");

    expect(mocks.prisma.waitlist.findUnique).toHaveBeenCalledWith({
      select: selectClause,
      where: { email: "mixed@example.com" },
    });
  });
});
