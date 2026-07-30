import { describe, expect, it, vi } from "vitest";
import { emailCounterUtcDay, recordResendSend } from "./send-counter";

describe("Resend send counter", () => {
  it("atomically increments the UTC-day row before a non-reserved send", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const now = new Date("2026-07-31T23:59:59.000Z");

    await recordResendSend(false, now, { dailySendCounter: { upsert } } as never);

    expect(upsert).toHaveBeenCalledWith({
      create: { count: 1, day: emailCounterUtcDay(now) },
      update: { count: { increment: 1 } },
      where: { day: emailCounterUtcDay(now) },
    });
  });

  it("does not double-count a sign-in reservation", async () => {
    const upsert = vi.fn();

    await recordResendSend(true, new Date(), { dailySendCounter: { upsert } } as never);

    expect(upsert).not.toHaveBeenCalled();
  });
});
