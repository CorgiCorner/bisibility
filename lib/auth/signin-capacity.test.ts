import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: { count: vi.fn() },
  currentAuthTransaction: vi.fn(() => null),
  user: { count: vi.fn() },
}));

vi.mock("next/cache", () => ({
  unstable_cache: (callback: unknown) => callback,
}));
vi.mock("@/lib/auth/auth-database", () => ({
  currentAuthTransaction: mocks.currentAuthTransaction,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $executeRaw: vi.fn(),
    account: mocks.account,
    user: mocks.user,
  },
}));
vi.mock("@/lib/deployment/deployment", () => ({ isCloud: true }));

import { capacityUtcDay, enforceGoogleSignupCapacity, readSignInCapacity } from "./signin-capacity";
import { GOOGLE_CAPACITY_EXHAUSTED } from "./signin-capacity-types";

const settings = {
  email_daily_send_cap: 100,
  email_monthly_send_cap: 3_000,
  google_signup_cap: 125,
};

describe("sign-in capacity", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads the Google cap from instance settings", async () => {
    const client = {
      account: { count: vi.fn().mockResolvedValue(86) },
      user: { count: vi.fn().mockResolvedValue(26) },
    };
    const now = new Date("2026-07-24T12:00:00.000Z");

    await expect(
      readSignInCapacity(
        now,
        client,
        async () => settings,
        async () => null,
      ),
    ).resolves.toEqual({
      emailCodes: null,
      googleSpots: { cap: 125, left: 39 },
      signupsToday: 26,
    });
    expect(client.user.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: capacityUtcDay(now) } },
    });
  });

  it("serializes the final Google spot and leaves an existing identity untouched", async () => {
    const accounts = new Set(["google_existing"]);
    let lock = Promise.resolve();

    async function callback(accountId: string) {
      if (accounts.has(accountId)) return "signed-in";
      const previous = lock;
      let release = () => {};
      lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const transaction = {
          $executeRaw: vi.fn().mockResolvedValue(0),
          account: { count: vi.fn(async () => accounts.size) },
        };
        await enforceGoogleSignupCapacity(
          { providerId: "google" },
          null,
          transaction,
          async () => 2,
        );
        accounts.add(accountId);
        return "created";
      } finally {
        release();
      }
    }

    const raced = await Promise.allSettled([callback("google_new_1"), callback("google_new_2")]);
    expect(raced.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(raced.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(accounts).toHaveLength(2);
    await expect(callback("google_existing")).resolves.toBe("signed-in");
    const rejection = raced.find(({ status }) => status === "rejected");
    expect(rejection).toMatchObject({
      reason: { body: { code: GOOGLE_CAPACITY_EXHAUSTED } },
    });
  });
});
