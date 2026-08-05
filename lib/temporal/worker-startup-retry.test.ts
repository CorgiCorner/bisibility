import { describe, expect, it, vi } from "vitest";
import { classifyWorkerStartupError, runWorkerStartupStage } from "./worker-startup-retry";

describe("classifyWorkerStartupError", () => {
  it("fails only stable permanent codes and retries recognized transient statuses", () => {
    expect(classifyWorkerStartupError("transport", { code: "ECONNREFUSED" })).toBe("transient");
    expect(classifyWorkerStartupError("schedule-bootstrap", { code: "UNAVAILABLE" })).toBe(
      "transient",
    );
    expect(classifyWorkerStartupError("tls-auth", { code: 16 })).toBe("permanent");
    expect(classifyWorkerStartupError("namespace-cache", { cause: { code: 5 } })).toBe("transient");
    expect(
      classifyWorkerStartupError("tls-auth", {
        cause: { status: "PERMISSION_DENIED" },
      }),
    ).toBe("permanent");
    expect(classifyWorkerStartupError("tls-auth", { code: "CERT_HAS_EXPIRED" })).toBe("permanent");
  });

  it("does not classify from error-message text", () => {
    expect(classifyWorkerStartupError("transport", new Error("connection refused"))).toBe(
      "transient",
    );
    expect(classifyWorkerStartupError("transport", { code: "EHOSTUNREACH" })).toBe("transient");
  });

  it("handles cyclic cause chains without overflowing", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;

    expect(classifyWorkerStartupError("transport", error)).toBe("transient");
  });
});

describe("runWorkerStartupStage", () => {
  it("retries a transient failure and then succeeds", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("first"), { code: "ECONNREFUSED" }))
      .mockResolvedValueOnce("ready");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWorkerStartupStage("transport", operation, {
        now: vi.fn().mockReturnValue(0),
        random: () => 0,
        sleep,
      }),
    ).resolves.toBe("ready");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("fails permanent auth errors immediately", async () => {
    const error = Object.assign(new Error("denied"), { code: "UNAUTHENTICATED" });
    const operation = vi.fn().mockRejectedValue(error);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runWorkerStartupStage("tls-auth", operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
    expect(errorLog).toHaveBeenCalledWith("[temporal] worker startup stage failed", {
      attempt: 1,
      code: "UNAUTHENTICATED",
      retryClass: "permanent",
      stage: "tls-auth",
    });
    errorLog.mockRestore();
  });

  it("bounds unknown TLS and auth failures without relying on an external restart loop", async () => {
    const error = new Error("native transport failure");
    const operation = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWorkerStartupStage("tls-auth", operation, {
        now: vi.fn().mockReturnValue(0),
        random: () => 0,
        sleep,
      }),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("bounds namespace propagation retries", async () => {
    const error = Object.assign(new Error("missing"), { code: "NOT_FOUND" });
    const operation = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWorkerStartupStage("namespace-cache", operation, {
        now: vi.fn().mockReturnValue(0),
        random: () => 0,
        sleep,
      }),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 4_000);
  });
});
