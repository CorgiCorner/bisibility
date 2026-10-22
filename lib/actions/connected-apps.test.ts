import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeConnectedApp } from "./connected-apps";

const mocks = vi.hoisted(() => ({ session: vi.fn(), revoke: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/api/connected-apps", () => ({ revokeUserConnectedApp: mocks.revoke }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
describe("revoke connected app action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "viewer" } });
    mocks.revoke.mockResolvedValue({ revoked: true });
  });
  it("requires authentication", async () => {
    mocks.session.mockRejectedValue(new Error("unauthenticated"));
    await expect(revokeConnectedApp("app", { revokeCreatedTokens: false })).rejects.toThrow(
      "unauthenticated",
    );
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("takes user identity exclusively from the session and revalidates security", async () => {
    await revokeConnectedApp("app", { revokeCreatedTokens: true, userId: "victim" } as {
      revokeCreatedTokens: boolean;
    });
    expect(mocks.revoke).toHaveBeenCalledWith("viewer", "app", {
      clientId: "app",
      revokeCreatedTokens: true,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/account/security");
  });
  it("validates options and client ID before service calls", async () => {
    await expect(revokeConnectedApp("", { revokeCreatedTokens: false })).rejects.toThrow();
    await expect(
      revokeConnectedApp("app", { revokeCreatedTokens: "true" } as never),
    ).rejects.toThrow();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
});
