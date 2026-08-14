import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPersonalTokens } from "./personal-tokens";

const TOKEN_PUBLIC_ID = "pat_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  listPersonalTokens: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/pat-service", () => ({
  listPersonalTokens: mocks.listPersonalTokens,
  tierFromScopes: () => "read",
}));

function token(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    expiresAt: null,
    id: "personal_token_1",
    lastUsedAt: null,
    name: "Automation",
    prefix: "bsb_pat_live_example",
    publicId: TOKEN_PUBLIC_ID,
    revokedAt: null,
    scopes: ["read"],
    ...overrides,
  };
}

describe("personal token queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPersonalTokens.mockResolvedValue([token()]);
  });

  it("returns only the stored public token ID to account clients", async () => {
    await expect(getPersonalTokens("user_1")).resolves.toEqual([
      expect.objectContaining({
        createdAt: "2026-07-01T00:00:00.000Z",
        expiresAt: null,
        id: TOKEN_PUBLIC_ID,
        lastUsedAt: null,
        name: "Automation",
      }),
    ]);
  });

  it("fails closed when the stored public token ID is unavailable", async () => {
    mocks.listPersonalTokens.mockResolvedValue([token({ publicId: null })]);

    await expect(getPersonalTokens("user_1")).rejects.toThrow(
      "Personal access token public ID is not available.",
    );
  });
});
