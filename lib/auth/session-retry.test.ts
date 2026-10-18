import { createHmac } from "node:crypto";
import { APIError } from "@better-auth/core/error";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";
import {
  isTransientSessionDatabaseError,
  retryTransientSessionDatabaseRead,
} from "./session-retry";

const sessionFailure = (status: "INTERNAL_SERVER_ERROR" | "UNAUTHORIZED") =>
  APIError.from(status, { code: "FAILED_TO_GET_SESSION", message: "Failed to get session" });

async function nativeSession(stale = false) {
  const secret = "local-fixture-".repeat(3);
  const token = "isolated-session-token";
  const expiresIn = 60 * 60 * 24 * 30;
  const updateAge = 60 * 60 * 24;
  const now = Date.now();
  const createdAt = new Date(now - (stale ? updateAge + 1 : 0) * 1_000);
  const stored = {
    session: {
      id: "session-1",
      userId: "user-1",
      token,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(createdAt.valueOf() + expiresIn * 1_000),
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: "user-1",
      name: "Local fixture",
      email: "fixture@example.com",
      emailVerified: true,
      image: null,
      createdAt,
      updatedAt: createdAt,
    },
  };
  const auth = betterAuth({
    baseURL: "http://session.example.com",
    secret,
    database: memoryAdapter({ user: [], session: [] }),
    logger: { disabled: true },
    session: { expiresIn, updateAge, cookieCache: { enabled: true, maxAge: 60 } },
  });
  const context = await auth.$context;
  const lookup = vi.fn(async () => stored);
  const update = vi.fn(async (requested: string, patch: Partial<typeof stored.session>) =>
    requested === token ? Object.assign(stored.session, patch) : null,
  );
  context.internalAdapter.findSession = lookup;
  context.internalAdapter.updateSession = update;
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  const headers = new Headers({
    cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`,
  });
  const failures: unknown[] = [];
  const read = async () => {
    try {
      return await auth.api.getSession({ headers });
    } catch (error) {
      failures.push(error);
      throw error;
    }
  };
  const cachedRead = async () => {
    const result = await auth.api.getSession({ headers, returnHeaders: true });
    const cookie = result.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${context.authCookies.sessionData.name}=`));
    if (!cookie) throw new Error("Native session cache cookie missing");
    const cachedHeaders = new Headers({
      cookie: `${headers.get("cookie")}; ${cookie.split(";")[0]}`,
    });
    return () => auth.api.getSession({ headers: cachedHeaders });
  };
  return { read, cachedRead, lookup, update, failures, stored };
}

describe("session backend availability", () => {
  it("recovers the actual cause-free Better Auth internal session failure", async () => {
    const failure = sessionFailure("INTERNAL_SERVER_ERROR");
    expect(failure.cause).toBeUndefined();
    const read = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({ id: "session-1" });

    await expect(retryTransientSessionDatabaseRead(read)).resolves.toEqual({
      ok: true,
      value: { id: "session-1" },
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("rethrows the last persistent opaque failure instead of hiding it as logout", async () => {
    const first = sessionFailure("INTERNAL_SERVER_ERROR");
    const last = sessionFailure("INTERNAL_SERVER_ERROR");
    const read = vi.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(last);
    await expect(retryTransientSessionDatabaseRead(read)).rejects.toBe(last);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps positively identified persistent connectivity failures fail closed", async () => {
    const read = vi.fn().mockRejectedValue({ code: "P1001" });
    await expect(retryTransientSessionDatabaseRead(read)).resolves.toEqual({ ok: false });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("rethrows an opaque second failure after a positively identified connection error", async () => {
    const last = sessionFailure("INTERNAL_SERVER_ERROR");
    const read = vi.fn().mockRejectedValueOnce({ code: "P1001" }).mockRejectedValueOnce(last);
    await expect(retryTransientSessionDatabaseRead(read)).rejects.toBe(last);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("fails closed for a positively identified connection error after an opaque failure", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(sessionFailure("INTERNAL_SERVER_ERROR"))
      .mockRejectedValueOnce({ code: "P1001" });
    await expect(retryTransientSessionDatabaseRead(read)).resolves.toEqual({ ok: false });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each(["P1001", "P1002", "P1017", "P2024", "ECONNREFUSED"])(
    "recovers one transient %s account read",
    async (code) => {
      const read = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error("Database unavailable"), { code }))
        .mockResolvedValueOnce("active");
      await expect(retryTransientSessionDatabaseRead(read)).resolves.toEqual({
        ok: true,
        value: "active",
      });
      expect(read).toHaveBeenCalledTimes(2);
    },
  );

  it("recognizes a connection code inside Prisma driver metadata", () => {
    expect(
      isTransientSessionDatabaseError({
        meta: { driverAdapterError: { cause: { originalCode: "ECONNRESET" } } },
      }),
    ).toBe(true);
  });

  it("recognizes a pg checkout timeout after Prisma query context", () => {
    expect(
      isTransientSessionDatabaseError(
        new Error(
          "Invalid prisma.user.findUnique invocation:\ntimeout exceeded when trying to connect",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    sessionFailure("UNAUTHORIZED"),
    Object.assign(sessionFailure("UNAUTHORIZED"), { cause: { code: "P1001" } }),
    Object.assign(
      APIError.from("FORBIDDEN", { code: "FAILED_TO_GET_SESSION", message: "Denied" }),
      {
        cause: { code: "P1001" },
      },
    ),
    APIError.from("INTERNAL_SERVER_ERROR", {
      code: "UNEXPECTED",
      message: "Failed to get session",
    }),
    new Error("Failed to get session"),
    Object.assign(new Error("Bad credentials"), { code: "P1000" }),
    Object.assign(new Error("Missing schema"), { code: "P2021" }),
  ])("does not retry an authorization, unknown or invariant error", async (failure) => {
    const read = vi.fn().mockRejectedValue(failure);
    await expect(retryTransientSessionDatabaseRead(read)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledOnce();
  });
});

describe("native getSession contract with a signed local cookie", () => {
  it("uses the actual valid session cache cookie without another adapter read", async () => {
    const fixture = await nativeSession();
    const readCached = await fixture.cachedRead();
    fixture.lookup.mockRejectedValue(new Error("Cache hit must not read the database"));
    await expect(readCached()).resolves.toMatchObject({ session: { id: "session-1" } });
    expect(fixture.lookup).toHaveBeenCalledOnce();
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("recovers once from the actual cause-free wrapper emitted for an adapter invariant", async () => {
    const fixture = await nativeSession();
    fixture.lookup.mockRejectedValueOnce(
      Object.assign(new Error("Missing schema"), { code: "P2021" }),
    );
    await expect(retryTransientSessionDatabaseRead(fixture.read)).resolves.toMatchObject({
      ok: true,
      value: { session: { id: "session-1" }, user: { id: "user-1" } },
    });
    expect(fixture.failures).toHaveLength(1);
    expect(fixture.failures[0]).toBeInstanceOf(Error);
    expect(fixture.failures[0]).toMatchObject({
      name: "APIError",
      statusCode: 500,
      body: { code: "FAILED_TO_GET_SESSION" },
    });
    expect((fixture.failures[0] as Error).cause).toBeUndefined();
    expect(fixture.lookup).toHaveBeenCalledTimes(2);
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("preserves the last actual APIError from a persistent adapter invariant", async () => {
    const fixture = await nativeSession();
    fixture.lookup.mockRejectedValue(Object.assign(new Error("Missing schema"), { code: "P2021" }));
    const failure = await retryTransientSessionDatabaseRead(fixture.read).catch(
      (error: unknown) => error,
    );
    expect(fixture.failures).toHaveLength(2);
    expect(failure).toBe(fixture.failures[1]);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ statusCode: 500, body: { code: "FAILED_TO_GET_SESSION" } });
    expect((failure as Error).cause).toBeUndefined();
    expect(fixture.lookup).toHaveBeenCalledTimes(2);
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("can refresh an old session during getSession without repeating the expiry write", async () => {
    const fixture = await nativeSession(true);
    const previousExpiry = fixture.stored.session.expiresAt;
    await fixture.read();
    await fixture.read();
    expect(fixture.stored.session.expiresAt.valueOf()).toBeGreaterThan(previousExpiry.valueOf());
    expect(fixture.lookup).toHaveBeenCalledTimes(2);
    expect(fixture.update).toHaveBeenCalledOnce();
  });

  it("recovers a lost refresh response without replaying an already-applied expiry update", async () => {
    const fixture = await nativeSession(true);
    fixture.update.mockImplementationOnce(async (_token, patch) => {
      Object.assign(fixture.stored.session, patch);
      throw Object.assign(new Error("Lost local refresh response"), { code: "ECONNRESET" });
    });
    await expect(retryTransientSessionDatabaseRead(fixture.read)).resolves.toMatchObject({
      ok: true,
    });
    expect(fixture.lookup).toHaveBeenCalledTimes(2);
    expect(fixture.update).toHaveBeenCalledOnce();
  });

  it("does not retry a native unauthorized refresh when the session was deleted", async () => {
    const fixture = await nativeSession(true);
    fixture.update.mockResolvedValueOnce(null);
    await expect(retryTransientSessionDatabaseRead(fixture.read)).rejects.toMatchObject({
      statusCode: 401,
      body: { code: "FAILED_TO_GET_SESSION" },
    });
    expect(fixture.lookup).toHaveBeenCalledOnce();
    expect(fixture.update).toHaveBeenCalledOnce();
  });
});
