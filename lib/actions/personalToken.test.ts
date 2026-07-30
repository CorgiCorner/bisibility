import { beforeEach, describe, expect, it, vi } from "vitest";
import { issuePersonalTokenAction, revokePersonalTokenAction } from "./personalToken";

const TOKEN_PUBLIC_ID = "pat_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  issuePersonalToken: vi.fn(),
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  revokePersonalToken: vi.fn(),
}));

vi.mock("@/lib/api/pat-service", () => ({
  issuePersonalToken: mocks.issuePersonalToken,
  revokePersonalToken: mocks.revokePersonalToken,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

describe("personal token actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.issuePersonalToken.mockResolvedValue({
      id: "personal_token_1",
      maskedValue: "bsb_pat_live_example******abcd",
      name: "Automation",
      publicId: TOKEN_PUBLIC_ID,
      raw: "bsb_pat_live_example-secret",
    });
    mocks.revokePersonalToken.mockResolvedValue({
      id: "personal_token_1",
      publicId: TOKEN_PUBLIC_ID,
      revokedAt: new Date("2026-07-27T12:00:00.000Z"),
    });
  });

  it("returns the one-time secret without leaking the database ID", async () => {
    const result = await issuePersonalTokenAction({
      expiresInDays: 90,
      name: "Automation",
      scope: "read",
    });

    expect(result).toEqual({
      maskedValue: "bsb_pat_live_example******abcd",
      name: "Automation",
      raw: "bsb_pat_live_example-secret",
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("publicId");
  });

  it("roundtrips the public token ID while updating by the internal ID in the service", async () => {
    await expect(revokePersonalTokenAction({ tokenId: TOKEN_PUBLIC_ID })).resolves.toEqual({
      id: TOKEN_PUBLIC_ID,
      revokedAt: new Date("2026-07-27T12:00:00.000Z"),
    });
    expect(mocks.revokePersonalToken).toHaveBeenCalledWith("user_1", TOKEN_PUBLIC_ID);
  });

  it("rejects a raw database token ID before querying", async () => {
    await expect(revokePersonalTokenAction({ tokenId: "personal_token_1" })).rejects.toThrow(
      "Personal access token not found.",
    );
    expect(mocks.revokePersonalToken).not.toHaveBeenCalled();
  });
});
