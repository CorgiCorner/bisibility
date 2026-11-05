import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const identity = { connectionId: "connection_1", credentialVersion: "version_1" };
let client: typeof import("./google-client");

function token(accessToken = "fixture-access", expiresIn: unknown = 3600, rotated?: string) {
  return Response.json({
    access_token: accessToken,
    expires_in: expiresIn,
    ...(rotated ? { refresh_token: rotated } : {}),
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-client-secret");
  client = await import("./google-client");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const refresh = (
  scope = identity,
  secret = "fixture-refresh",
  persist?: (value: string) => Promise<void>,
  signal?: AbortSignal,
) => client.refreshGoogleAccessToken(secret, persist, signal, scope);

describe("connection token cache", () => {
  it("does not publish an obsolete in-flight grant after credential replacement", async () => {
    let complete = (_response: Response) => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      )
      .mockImplementation(async () => token("new-access"));
    vi.stubGlobal("fetch", fetchMock);
    const old = refresh();
    const updated = { ...identity, credentialVersion: "version_2" };
    await expect(refresh(updated, "new-refresh")).resolves.toBe("new-access");
    await expect(refresh()).rejects.toThrow("credentials changed");
    complete(token("old-access"));
    await old;
    await expect(refresh(updated, "new-refresh")).resolves.toBe("new-access");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["headers", "body"])(
    "releases a stalled exchange at its own deadline during %s",
    async (phase) => {
      const deadline = new AbortController();
      const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal);
      let complete = (_value: unknown) => {};
      const pending = new Promise((resolve) => {
        complete = resolve;
      });
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() =>
          phase === "headers" ? pending : Promise.resolve({ ok: true, json: () => pending }),
        )
        .mockImplementation(async () => token());
      vi.stubGlobal("fetch", fetchMock);
      const first = refresh();
      const reason = new DOMException("fixture deadline", "TimeoutError");
      deadline.abort(reason);
      await expect(first).rejects.toBe(reason);
      expect(timeout).toHaveBeenCalledWith(30_000);
      complete(phase === "headers" ? token() : { access_token: "late-access", expires_in: 3600 });
      await expect(refresh()).resolves.toBe("fixture-access");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("handles cancellation racing with a rejecting exchange without an unhandled rejection", async () => {
    const abort = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        abort.abort();
        throw new Error("fixture network failure");
      }),
    );
    await expect(
      refresh(identity, "fixture-refresh", undefined, abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it("reuses one exchange across independent sequential reads", async () => {
    const fetchMock = vi.fn(async () => token());
    vi.stubGlobal("fetch", fetchMock);
    await expect(refresh()).resolves.toBe("fixture-access");
    await expect(refresh()).resolves.toBe("fixture-access");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("deduplicates two concurrent misses", async () => {
    let complete = (_response: Response) => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = refresh();
    const second = refresh();
    complete(token());
    await expect(Promise.all([first, second])).resolves.toEqual([
      "fixture-access",
      "fixture-access",
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["connection", "version", "refresh", "client", "secret"])(
    "isolates a changed %s identity",
    async (changed) => {
      const fetchMock = vi.fn(async () => token());
      vi.stubGlobal("fetch", fetchMock);
      await refresh();
      if (changed === "client") vi.stubEnv("GOOGLE_CLIENT_ID", "other-client");
      if (changed === "secret") vi.stubEnv("GOOGLE_CLIENT_SECRET", "other-secret");
      await refresh(
        {
          connectionId: changed === "connection" ? "connection_2" : identity.connectionId,
          credentialVersion: changed === "version" ? "version_2" : identity.credentialVersion,
        },
        changed === "refresh" ? "other-refresh" : "fixture-refresh",
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("expires exactly at the early-expiry boundary", async () => {
    const fetchMock = vi.fn(async () => token());
    vi.stubGlobal("fetch", fetchMock);
    const startedAt = Date.now();
    await refresh();
    vi.setSystemTime(startedAt + 3_539_999);
    await refresh();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.setSystemTime(startedAt + 3_540_000);
    await refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, null, "3600", 0, -1, 60, 1.5, Number.MAX_VALUE])(
    "never assumes a lifetime for expiry %s",
    async (expiry) => {
      const fetchMock = vi.fn(async () =>
        Response.json({ access_token: "fixture-access", expires_in: expiry }),
      );
      vi.stubGlobal("fetch", fetchMock);
      await refresh();
      await refresh();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("measures expiry from before the exchange instead of response arrival", async () => {
    let complete = (_response: Response) => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      )
      .mockImplementation(async () => token());
    vi.stubGlobal("fetch", fetchMock);
    const startedAt = Date.now();
    const pending = refresh();
    vi.setSystemTime(startedAt + 3_540_000);
    complete(token());
    await pending;
    await refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds retained tokens by evicting the least recently used entry", async () => {
    const fetchMock = vi.fn(async () => token());
    vi.stubGlobal("fetch", fetchMock);
    for (let index = 0; index < 100; index++)
      await refresh({ ...identity, connectionId: `connection_${index}` });
    await refresh({ ...identity, connectionId: "connection_0" });
    await refresh({ ...identity, connectionId: "connection_100" });
    await refresh({ ...identity, connectionId: "connection_0" });
    expect(fetchMock).toHaveBeenCalledTimes(101);
    await refresh({ ...identity, connectionId: "connection_1" });
    expect(fetchMock).toHaveBeenCalledTimes(102);
  });

  it("bounds in-flight exchanges and admits work again after they settle", async () => {
    const completions: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => completions.push(resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const pending = Array.from({ length: 100 }, (_, index) =>
      refresh({ ...identity, connectionId: `connection_${index}` }),
    );
    const overflow = refresh({ ...identity, connectionId: "overflow" });
    for (const complete of completions) complete(token());
    await expect(overflow).rejects.toThrow("capacity");
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(100);
    fetchMock.mockImplementation(async () => token());
    await refresh({ ...identity, connectionId: "overflow" });
    expect(fetchMock).toHaveBeenCalledTimes(101);
  });

  it("persists a shared rotation for each owner callback and retries failed persistence on a hit", async () => {
    const fetchMock = vi.fn(async () => token("fixture-access", 3600, "fixture-rotated"));
    vi.stubGlobal("fetch", fetchMock);
    const firstOwner = vi
      .fn()
      .mockRejectedValueOnce(new Error("fixture-refresh fixture-access fixture-rotated"));
    const secondOwner = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await Promise.all([
      refresh(identity, "fixture-refresh", firstOwner),
      refresh(identity, "fixture-refresh", secondOwner),
    ]);
    await refresh(identity, "fixture-refresh", firstOwner);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(firstOwner).toHaveBeenCalledTimes(2);
    expect(secondOwner).toHaveBeenCalledWith("fixture-rotated");
    expect(log).toHaveBeenCalledWith("[google] rotated refresh token persistence failed", {
      errorClass: "credential_persistence",
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /fixture-refresh|fixture-access|fixture-rotated/,
    );
  });

  it("checks cancellation on a hit without returning a cached token", async () => {
    const fetchMock = vi.fn(async () => token());
    vi.stubGlobal("fetch", fetchMock);
    await refresh();
    const abort = new AbortController();
    const reason = new Error("caller cancelled");
    abort.abort(reason);
    await expect(refresh(identity, "fixture-refresh", undefined, abort.signal)).rejects.toBe(
      reason,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("cancels one waiter without cancelling another or losing its rotation callback", async () => {
    let complete = (_response: Response) => {};
    let transportSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      transportSignal = init?.signal;
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const abort = new AbortController();
    const persist = vi.fn().mockResolvedValue(undefined);
    const first = refresh(identity, "fixture-refresh", persist, abort.signal);
    const second = refresh();
    abort.abort();
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    complete(token("fixture-access", 3600, "fixture-rotated"));
    await rejected;
    await expect(second).resolves.toBe("fixture-access");
    expect(transportSignal?.aborted).toBe(false);
    expect(persist).toHaveBeenCalledWith("fixture-rotated");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retain a failed invalid_grant exchange", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: "invalid_grant", error_description: "fixture-refresh fixture-access" },
          { status: 400 },
        ),
      )
      .mockImplementation(async () => token());
    vi.stubGlobal("fetch", fetchMock);
    await expect(refresh()).rejects.toMatchObject({ name: "ProviderAuthError" });
    await expect(refresh()).resolves.toBe("fixture-access");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
