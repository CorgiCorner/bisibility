import { describe, expect, it, vi } from "vitest";
import { retrySerializableTransaction } from "./transaction-retry";

describe("serializable transaction retry", () => {
  it("retries the complete operation after a P2034 conflict", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: "P2034" }))
      .mockResolvedValue("done");
    await expect(retrySerializableTransaction(operation)).resolves.toBe("done");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("stops after the bounded attempt count", async () => {
    const conflict = Object.assign(new Error("conflict"), { code: "P2034" });
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(conflict);
    await expect(retrySerializableTransaction(operation, 3)).rejects.toBe(conflict);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-conflict errors", async () => {
    const failure = new Error("database unavailable");
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(failure);
    await expect(retrySerializableTransaction(operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledOnce();
  });
});
