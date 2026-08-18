import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMarketingUnsubscribeToken,
  unsubscribeFromMarketingEmails,
  verifyMarketingUnsubscribeToken,
} from "./marketing-unsubscribe";

const { updateManyMock } = vi.hoisted(() => ({ updateManyMock: vi.fn() }));
const primaryKey = Buffer.alloc(32, 7).toString("base64");
const retiredKey = Buffer.alloc(32, 8).toString("base64");

vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { updateMany: updateManyMock } } }));

describe("marketing email unsubscribe", () => {
  afterEach(() => {
    updateManyMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("signs an opaque user capability and rejects tampering", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey);
    const token = createMarketingUnsubscribeToken("user_1");

    expect(verifyMarketingUnsubscribeToken(token)).toBe("user_1");
    expect(verifyMarketingUnsubscribeToken(`${token}x`)).toBeNull();
  });

  it("keeps tokens valid while their retired application key remains configured", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", retiredKey);
    const token = createMarketingUnsubscribeToken("user_1");

    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey);
    vi.stubEnv("BISIBILITY_SECRETS_KEYS_RETIRED", retiredKey);
    expect(verifyMarketingUnsubscribeToken(token)).toBe("user_1");
  });

  it("records the global opt-out without revealing whether the user exists", async () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey);
    updateManyMock.mockResolvedValue({ count: 1 });
    const token = createMarketingUnsubscribeToken("user_1");

    await expect(unsubscribeFromMarketingEmails(token)).resolves.toBe(true);
    expect(updateManyMock).toHaveBeenCalledWith({
      data: { marketingEmailUnsubscribedAt: expect.any(Date) },
      where: { id: "user_1", marketingEmailUnsubscribedAt: null },
    });
  });

  it("does not touch the database for an invalid token", async () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey);

    await expect(unsubscribeFromMarketingEmails("invalid")).resolves.toBe(false);
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
