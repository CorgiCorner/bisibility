import { describe, expect, it, vi } from "vitest";
import { isTransientDatabaseReadError, retryTransientDatabaseRead } from "./transient-read";

describe("connection read recovery boundary", () => {
  it("recovers a nested driver failure without exceeding two reads", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce({ meta: { driverAdapterError: { cause: { originalCode: "08006" } } } })
      .mockResolvedValueOnce("snapshot");
    await expect(retryTransientDatabaseRead(read)).resolves.toEqual({
      ok: true,
      value: "snapshot",
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("stops after two failed reads", async () => {
    const read = vi.fn().mockRejectedValue({ code: "P2024" });
    await expect(retryTransientDatabaseRead(read)).resolves.toEqual({ ok: false });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([
    "Connection terminated due to connection timeout",
    "Connection terminated unexpectedly",
    "connection timeout",
    "server closed the connection unexpectedly",
    "timeout acquiring a connection",
    "timeout exceeded when trying to connect",
  ])("recognizes a known connection line after Prisma context: %s", (message) => {
    expect(
      isTransientDatabaseReadError(new Error(`Invalid database read invocation:\n${message}`)),
    ).toBe(true);
  });

  it("does not repeat unknown, schema, credentials or transaction failures", async () => {
    for (const failure of [
      new Error("provider operation timeout exceeded"),
      new Error("query input contains Connection terminated due to connection timeout"),
      { code: "P1000" },
      { code: "P2021" },
      { code: "P2028" },
      { code: "P2034" },
    ]) {
      const read = vi.fn().mockRejectedValue(failure);
      await expect(retryTransientDatabaseRead(read)).rejects.toBe(failure);
      expect(read).toHaveBeenCalledOnce();
    }
  });

  it("ignores accessors and handles cyclic causes without throwing or invoking code", () => {
    const getter = vi.fn(() => {
      throw new Error("must not run");
    });
    const failure = Object.defineProperty({ cause: null as unknown }, "code", { get: getter });
    failure.cause = failure;
    expect(isTransientDatabaseReadError(failure)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
});
