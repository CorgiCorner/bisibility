import { describe, expect, it, vi } from "vitest";
import { ProviderCallError } from "./call-error";
import { readObservedResponse } from "./usage";

describe("synchronous producer fence after native admission", () => {
  it("settles a refused pre-request fence as confirmed zero without invoking transport", async () => {
    const order: string[] = [];
    const denied = new ProviderCallError("Fence refused", 0);
    const request = vi.fn();
    const settle = vi.fn(async () => {
      order.push("zero");
    });
    await expect(
      readObservedResponse({
        observer: {
          begin: vi.fn(async () => {
            order.push("begin");
            return "native";
          }),
          beforeDispatch: vi.fn(async () => {
            order.push("native-fence");
          }),
          settle,
        },
        beforeRequest: () => {
          order.push("producer-fence");
          throw denied;
        },
        request,
        measure: vi.fn(),
      }),
    ).rejects.toBe(denied);
    expect(order).toEqual(["begin", "native-fence", "producer-fence", "zero"]);
    expect(settle).toHaveBeenCalledWith("native", {
      cached: false,
      failed: true,
      costCents: 0,
      quantity: 0,
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("retains uncertain zero-receipt persistence without trying transport", async () => {
    const request = vi.fn();
    await expect(
      readObservedResponse({
        observer: {
          begin: vi.fn(async () => "native"),
          settle: vi.fn(async () => {
            throw new Error("Receipt persistence unavailable");
          }),
        },
        beforeRequest: () => {
          throw new ProviderCallError("Fence refused", 0);
        },
        request,
        measure: vi.fn(),
      }),
    ).rejects.toMatchObject({ phase: "settlement", attemptId: "native" });
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves an invoked transport exception as unknown even when it claims zero cost", async () => {
    const settle = vi.fn();
    const request = vi.fn(async () => {
      throw new ProviderCallError("After transport invocation", 0);
    });
    await expect(
      readObservedResponse({
        observer: { begin: vi.fn(async () => "native"), settle },
        beforeRequest: () => undefined,
        request,
        measure: vi.fn(),
      }),
    ).rejects.toMatchObject({ phase: "request", attemptId: "native" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith("native", {
      cached: false,
      failed: true,
      costCents: null,
      quantity: null,
    });
  });
});
