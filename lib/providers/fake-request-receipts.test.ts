import { afterEach, describe, expect, it, vi } from "vitest";
import { getSerpProvider } from "./registry";
import type { ProviderUsageObserver } from "./usage";

afterEach(() => vi.unstubAllEnvs());

describe("synthetic provider accounting receipts", () => {
  it("retains confirmed zero usage through the ordinary observer before returning fake results", async () => {
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
    const order: string[] = [];
    const observer: ProviderUsageObserver = {
      begin: vi.fn(async () => {
        order.push("begin");
        return "synthetic-attempt";
      }),
      beforeDispatch: vi.fn(async () => {
        order.push("fence");
      }),
      settle: vi.fn(async () => {
        order.push("settle");
      }),
    };
    const provider = getSerpProvider("dataforseo");
    if (!provider.fetchBacklinksSummary) throw new Error("Missing backlinks capability");
    const result = await provider.fetchBacklinksSummary(
      { usageObserver: observer },
      { target: "example.com", includeSubdomains: true, targetScope: "site" },
    );
    expect(result.costCents).toBe(0);
    expect(order).toEqual(["begin", "fence", "settle"]);
    expect(observer.settle).toHaveBeenCalledWith(
      "synthetic-attempt",
      expect.objectContaining({
        costCents: 0,
        quantity: 0,
        failed: false,
        cached: false,
      }),
    );
  });

  it("does not return usable results when the observer cannot retain settlement", async () => {
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
    const failure = new Error("synthetic settlement failed");
    const observer: ProviderUsageObserver = {
      begin: vi.fn(async () => "synthetic-attempt"),
      beforeDispatch: vi.fn(async () => undefined),
      settle: vi.fn(async () => {
        throw failure;
      }),
    };
    const provider = getSerpProvider("dataforseo");
    if (!provider.fetchBacklinksSummary) throw new Error("Missing backlinks capability");
    await expect(
      provider.fetchBacklinksSummary(
        { usageObserver: observer },
        { target: "example.com", includeSubdomains: true, targetScope: "site" },
      ),
    ).rejects.toBe(failure);
  });
});
