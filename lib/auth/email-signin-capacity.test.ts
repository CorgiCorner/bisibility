import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: "resend" as "resend" | "ses" | "unknown" | null,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (callback: unknown) => callback,
}));
vi.mock("@/lib/deployment/deployment", () => ({ isCloud: true }));
vi.mock("@/lib/email/registry", () => ({
  resolveEmailProvider: () => {
    if (mocks.provider === "unknown") throw new Error("unknown provider");
    return mocks.provider ? { id: mocks.provider, isConfigured: () => true } : null;
  },
}));

import {
  capacityUtcDay,
  readEmailSignInCapacity,
  reserveEmailSignInCode,
} from "./email-signin-capacity";

const settings = {
  email_daily_send_cap: 100,
  email_monthly_send_cap: 3_000,
  google_signup_cap: 100,
};

function counterClient(initialCount = 0) {
  let count = initialCount;
  const client = {
    dailySendCounter: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { count: 0 } }),
      findUnique: vi.fn().mockImplementation(async () => ({ count })),
      updateMany: vi.fn().mockImplementation(async ({ where }) => {
        if (count >= where.count.lt) return { count: 0 };
        count += 1;
        return { count: 1 };
      }),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { client, count: () => count };
}

describe("email sign-in capacity", () => {
  afterEach(() => {
    mocks.provider = "resend";
    vi.clearAllMocks();
  });

  it("shows the Resend meter against the daily database cap", async () => {
    const { client } = counterClient(41);
    const monthlyUsage = vi.fn().mockResolvedValue(541);

    await expect(
      readEmailSignInCapacity(
        new Date("2026-07-24T12:00:00.000Z"),
        client,
        async () => settings,
        monthlyUsage,
      ),
    ).resolves.toEqual({ binding: "daily", cap: 100, left: 59 });
    expect(monthlyUsage).toHaveBeenCalledWith(
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    );
  });

  it("grants exactly one of two concurrent reservations for the final daily slot", async () => {
    const { client, count } = counterClient(99);
    const reserve = () =>
      reserveEmailSignInCode(
        new Date("2026-07-24T12:00:00.000Z"),
        client,
        async () => settings,
        async () => 500,
      );

    const reservations = await Promise.all([reserve(), reserve()]);

    expect(reservations.filter(({ granted }) => granted)).toHaveLength(1);
    expect(count()).toBe(100);
  });

  it("rejects when the monthly allowance for today is already exhausted", async () => {
    const { client, count } = counterClient(10);

    await expect(
      reserveEmailSignInCode(
        new Date("2026-07-24T12:00:00.000Z"),
        client,
        async () => ({ ...settings, email_monthly_send_cap: 510 }),
        async () => 500,
      ),
    ).resolves.toEqual({ binding: "monthly", gated: true, granted: false });
    expect(count()).toBe(10);
  });

  it("reports monthly binding when daily and monthly capacity exhaust together", async () => {
    const { client } = counterClient(100);

    await expect(
      readEmailSignInCapacity(
        new Date("2026-07-24T12:00:00.000Z"),
        client,
        async () => ({ ...settings, email_monthly_send_cap: 600 }),
        async () => 600,
      ),
    ).resolves.toEqual({ binding: "monthly", cap: 600, left: 0 });
  });

  it("keeps SES provider and local remaining counts combined", async () => {
    mocks.provider = "ses";
    const { client } = counterClient(41);

    await expect(
      readEmailSignInCapacity(
        new Date("2026-07-24T12:00:00.000Z"),
        client,
        async () => settings,
        async () => 0,
        async () => ({ cap: 200, providerLeft: 143 }),
      ),
    ).resolves.toEqual({ binding: "daily", cap: 200, left: 143 });
  });

  it("keeps the SES reservation gate on its reported daily cap", async () => {
    mocks.provider = "ses";
    const { client, count } = counterClient(199);

    const reservations = await Promise.all([
      reserveEmailSignInCode(
        new Date("2026-07-24T12:00:00.000Z"),
        client,
        async () => settings,
        async () => 0,
        async () => ({ cap: 200, providerLeft: 1 }),
      ),
      reserveEmailSignInCode(
        new Date("2026-07-24T12:00:00.000Z"),
        client,
        async () => settings,
        async () => 0,
        async () => ({ cap: 200, providerLeft: 1 }),
      ),
    ]);

    expect(reservations.filter(({ granted }) => granted)).toHaveLength(1);
    expect(count()).toBe(200);
  });

  it("fails open for an unknown provider", async () => {
    mocks.provider = "unknown";
    const { client } = counterClient();

    await expect(readEmailSignInCapacity(new Date(), client)).resolves.toBeNull();
    await expect(reserveEmailSignInCode(new Date(), client)).resolves.toEqual({
      binding: null,
      gated: false,
      granted: true,
    });
    expect(client.dailySendCounter.upsert).not.toHaveBeenCalled();
  });

  it("uses UTC midnight for daily counter reads", async () => {
    const { client } = counterClient();
    const now = new Date("2026-07-24T00:00:00.000Z");

    await readEmailSignInCapacity(
      now,
      client,
      async () => settings,
      async () => 0,
    );

    expect(client.dailySendCounter.findUnique).toHaveBeenCalledWith({
      select: { count: true },
      where: { day: capacityUtcDay(now) },
    });
  });
});
