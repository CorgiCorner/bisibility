import { beforeEach, describe, expect, it, vi } from "vitest";

const { revokeMock } = vi.hoisted(() => ({ revokeMock: vi.fn() }));

vi.mock("@/lib/auth/session-revocation", () => ({ revokeOtherSessions: revokeMock }));

import { revokeOtherSessionsBeforeEmailChange } from "./email-change-session-revocation";

const current = {
  session: { id: "sess_1" },
  user: { email: "owner@example.com", id: "user_1" },
};
const context = { context: { session: current } };

describe("revokeOtherSessionsBeforeEmailChange", () => {
  beforeEach(() => {
    revokeMock.mockReset();
    revokeMock.mockResolvedValue(2);
  });

  it("revokes the caller's other sessions when the address is about to change", async () => {
    await revokeOtherSessionsBeforeEmailChange({ email: "next@example.com" }, context);

    expect(revokeMock).toHaveBeenCalledExactlyOnceWith(current);
  });

  it("ignores updates that do not touch the email", async () => {
    await revokeOtherSessionsBeforeEmailChange({ name: "Owner" }, context);

    expect(revokeMock).not.toHaveBeenCalled();
  });

  it("ignores a same-address write regardless of case", async () => {
    await revokeOtherSessionsBeforeEmailChange({ email: "Owner@Example.com" }, context);

    expect(revokeMock).not.toHaveBeenCalled();
  });

  it("does nothing without an endpoint session to keep", async () => {
    await revokeOtherSessionsBeforeEmailChange({ email: "next@example.com" }, null);
    await revokeOtherSessionsBeforeEmailChange(
      { email: "next@example.com" },
      { context: { session: null } },
    );

    expect(revokeMock).not.toHaveBeenCalled();
  });

  it("propagates a revocation failure so the address is not written", async () => {
    revokeMock.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      revokeOtherSessionsBeforeEmailChange({ email: "next@example.com" }, context),
    ).rejects.toThrow("database unavailable");
  });
});
