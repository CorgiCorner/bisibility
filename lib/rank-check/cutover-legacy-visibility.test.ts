import { describe, expect, it, vi } from "vitest";
import { collectStableLegacyVisibility } from "./cutover-legacy-visibility";

describe("collectStableLegacyVisibility", () => {
  it("waits through delayed visibility before accepting stable late-start evidence", async () => {
    const sample = vi
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const result = await collectStableLegacyVisibility({
      delay: async () => undefined,
      intervalMs: 1,
      sample,
      stableSamples: 3,
      timeoutMs: 5,
    });

    expect(result).toEqual({ complete: true, count: 1, samples: 5 });
  });

  it("returns incomplete after its explicit bound when visibility keeps changing", async () => {
    let count = 0;
    const result = await collectStableLegacyVisibility({
      delay: async () => undefined,
      intervalMs: 1,
      sample: async () => count++,
      stableSamples: 3,
      timeoutMs: 3,
    });

    expect(result).toEqual({ complete: false, count: 3, samples: 4 });
  });
});
