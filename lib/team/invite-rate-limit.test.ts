import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertInviteCreateAllowed,
  assertInviteResendAllowed,
  resetInviteRateLimitStateForTests,
} from "./invite-rate-limit";

describe("team invitation rate limits", () => {
  let redisUrl: string | undefined;

  beforeEach(() => {
    redisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = "";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
    resetInviteRateLimitStateForTests();
  });

  afterEach(() => {
    resetInviteRateLimitStateForTests();
    vi.useRealTimers();
    if (redisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = redisUrl;
    }
  });

  it("limits sequential invitation sends per actor and project", async () => {
    for (let index = 0; index < 8; index += 1) {
      await expect(assertInviteCreateAllowed("actor_1", "project_1")).resolves.toBeUndefined();
    }

    await expect(assertInviteCreateAllowed("actor_1", "project_1")).rejects.toThrow(
      "Too many invitations have been sent. Try again in 15 minutes.",
    );
    await expect(assertInviteCreateAllowed("actor_1", "project_2")).resolves.toBeUndefined();
  });

  it("applies a per-invite resend cooldown", async () => {
    await expect(assertInviteResendAllowed("invite_1")).resolves.toBeUndefined();

    await expect(assertInviteResendAllowed("invite_1")).rejects.toThrow(
      "This invitation was sent recently. Try again in 60 seconds.",
    );
    await expect(assertInviteResendAllowed("invite_2")).resolves.toBeUndefined();
  });

  it("exposes a deterministic reset for focused tests", async () => {
    await assertInviteResendAllowed("invite_1");
    resetInviteRateLimitStateForTests();

    await expect(assertInviteResendAllowed("invite_1")).resolves.toBeUndefined();
  });
});
