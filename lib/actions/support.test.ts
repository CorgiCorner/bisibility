import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupportWidgetPayload: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/lib/app-extensions", () => ({
  appExtensions: { getSupportWidgetPayload: mocks.getSupportWidgetPayload },
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));

import { refreshSupportWidget } from "./support";

describe("refreshSupportWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({
      session: { expiresAt: new Date("2026-09-10T12:00:00.000Z") },
      user: { id: "internal-user-id" },
    });
  });

  it("derives the refreshed identity solely from the authenticated session", async () => {
    mocks.getSupportWidgetPayload.mockResolvedValue(null);

    await expect(refreshSupportWidget()).resolves.toBeNull();
    expect(mocks.getSupportWidgetPayload).toHaveBeenCalledWith({
      expiresAt: new Date("2026-09-10T12:00:00.000Z"),
      userId: "internal-user-id",
    });
  });

  it("does not ask the adapter for a widget when authentication is invalid", async () => {
    mocks.requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(refreshSupportWidget()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.getSupportWidgetPayload).not.toHaveBeenCalled();
  });
});
