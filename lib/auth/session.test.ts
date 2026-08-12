import { redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
  getAuthSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession: mocks.getAuthSession } } }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    session: { deleteMany: mocks.deleteMany },
    user: { findUnique: mocks.findUnique },
  },
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/server", () => ({ connection: mocks.connection }));

import { RETURN_TO_REQUEST_HEADER } from "./return-to";
import { enforceActiveSession, getSession, getSessionReference, requireSession } from "./session";

const session = {
  session: { id: "session_1", userId: "user_1" },
  user: { id: "user_1" },
};

describe("enforceActiveSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.headers.mockResolvedValue(new Headers());
    redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it("passes through an active account session", async () => {
    mocks.findUnique.mockResolvedValueOnce({ deactivatedAt: null });

    await expect(enforceActiveSession(session)).resolves.toBe(session);

    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("retries the active-account lookup after a transient database timeout", async () => {
    mocks.findUnique
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockResolvedValueOnce({ deactivatedAt: null });

    await expect(enforceActiveSession(session)).resolves.toBe(session);

    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("rejects a cached session and removes persisted sessions when deactivated", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      deactivatedAt: new Date("2026-07-18T00:30:00.000Z"),
    });

    await expect(enforceActiveSession(session)).resolves.toBeNull();

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        user: { is: { deactivatedAt: { not: null } } },
        userId: "user_1",
      },
    });
  });

  it("fails closed for a missing user", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);

    await expect(enforceActiveSession(session)).resolves.toBeNull();

    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("still fails closed when best-effort cleanup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.findUnique.mockResolvedValueOnce({
      deactivatedAt: new Date("2026-07-18T00:30:00.000Z"),
    });
    mocks.deleteMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(enforceActiveSession(session)).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalledWith(
      "[auth] Failed to clean up sessions for a deactivated account.",
    );
    consoleError.mockRestore();
  });

  it("retries a transient Better Auth database timeout before resolving the session", async () => {
    mocks.getAuthSession
      .mockRejectedValueOnce(
        new Error("Failed to get session", {
          cause: new Error("Connection terminated due to connection timeout"),
        }),
      )
      .mockResolvedValueOnce(session);
    mocks.findUnique.mockResolvedValueOnce({ deactivatedAt: null });

    await expect(getSession()).resolves.toBe(session);

    expect(mocks.getAuthSession).toHaveBeenCalledTimes(2);
    expect(mocks.findUnique).toHaveBeenCalledOnce();
  });

  it("fails closed without throwing after repeated transient session timeouts", async () => {
    const timeout = new Error("Connection terminated due to connection timeout");
    mocks.getAuthSession.mockRejectedValue(timeout);

    await expect(getSession()).resolves.toBeNull();

    expect(mocks.getAuthSession).toHaveBeenCalledTimes(2);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("preserves the established unauthenticated session result", async () => {
    mocks.getAuthSession.mockResolvedValueOnce(null);

    await expect(getSession()).resolves.toBeNull();

    expect(mocks.getAuthSession).toHaveBeenCalledOnce();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("exposes a session reference without treating it as active authorization", async () => {
    mocks.getAuthSession.mockResolvedValueOnce(session);

    await expect(getSessionReference()).resolves.toBe(session);

    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("does not mask non-transient session failures", async () => {
    mocks.getAuthSession.mockRejectedValueOnce(new Error("Session payload signature is invalid"));

    await expect(getSession()).rejects.toThrow("Session payload signature is invalid");
    expect(mocks.getAuthSession).toHaveBeenCalledOnce();
  });

  it("redirects an unauthenticated request to login with its validated return path", async () => {
    mocks.getAuthSession.mockResolvedValueOnce(null);
    mocks.headers.mockResolvedValue(
      new Headers({ [RETURN_TO_REQUEST_HEADER]: "/app/settings?tab=access" }),
    );

    await expect(requireSession()).rejects.toThrow("redirect:");

    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fapp%2Fsettings%3Ftab%3Daccess");
  });

  it("redirects an unauthenticated request to plain login without a return path", async () => {
    mocks.getAuthSession.mockResolvedValueOnce(null);

    await expect(requireSession()).rejects.toThrow("redirect:");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it.each(["https://malicious.example/path", "//malicious.example/path"])(
    "redirects an unauthenticated request to plain login for unsafe return path %s",
    async (returnTo) => {
      mocks.getAuthSession.mockResolvedValueOnce(null);
      mocks.headers.mockResolvedValue(new Headers({ [RETURN_TO_REQUEST_HEADER]: returnTo }));

      await expect(requireSession()).rejects.toThrow("redirect:");

      expect(redirect).toHaveBeenCalledWith("/login");
    },
  );
});
