import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasActiveOnboardingApiKey } from "./onboarding";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiKey: { findFirst: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("hasActiveOnboardingApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.apiKey.findFirst.mockResolvedValue({ id: "key_1" });
  });

  it("excludes revoked and expired keys", async () => {
    await expect(hasActiveOnboardingApiKey("project_1")).resolves.toBe(true);

    expect(mocks.prisma.apiKey.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        projectId: "project_1",
        revokedAt: null,
      },
    });
  });
});
