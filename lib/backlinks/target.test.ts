import { describe, expect, it, vi } from "vitest";
import { normalizeBacklinksTarget, UnsupportedBacklinksTargetError } from "./target";

describe("normalizeBacklinksTarget", () => {
  it.each([
    ["https://user:pass@example.com", undefined],
    ["192.168.1.1", undefined],
    ["gibberish", undefined],
    ["https://acme-store.com/product?q=1", "page" as const],
    ["https://acme-store.com/product#details", "page" as const],
  ])("rejects unsupported target %s", (target, scope) => {
    expect(() => normalizeBacklinksTarget(target, scope)).toThrowError(
      expect.objectContaining({
        code: "unsupported_target",
        name: "UnsupportedBacklinksTargetError",
      }),
    );
  });

  it("raises the typed error A5 can map to unsupported_target", () => {
    expect(() => normalizeBacklinksTarget("localhost")).toThrow(UnsupportedBacklinksTargetError);
  });

  it.each([
    ["acme-store.com", undefined, { scope: "site", target: "acme-store.com" }],
    ["blog.acme.io/post/x", undefined, { scope: "page", target: "https://blog.acme.io/post/x" }],
    ["https://acme-store.com", undefined, { scope: "page", target: "https://acme-store.com/" }],
    [
      "https://www.acme-store.com/catalog/widget///",
      "page" as const,
      { scope: "page", target: "https://www.acme-store.com/catalog/widget" },
    ],
    [
      "https://www.acme-store.com/catalog/widget",
      "site" as const,
      { scope: "site", target: "acme-store.com" },
    ],
  ])("normalizes %s", (target, scope, expected) => {
    expect(normalizeBacklinksTarget(target, scope)).toEqual(expected);
  });

  it("keeps exact page subdomains while site scope strips only www", () => {
    expect(normalizeBacklinksTarget("www.blog.acme.io/post", "page")).toEqual({
      scope: "page",
      target: "https://www.blog.acme.io/post",
    });
    expect(normalizeBacklinksTarget("www.blog.acme.io", "site")).toEqual({
      scope: "site",
      target: "blog.acme.io",
    });
  });

  it("never invokes a provider callback for an invalid target", async () => {
    const providerCall = vi.fn();
    const validateThenCall = async (target: string) => {
      const normalized = normalizeBacklinksTarget(target, "page");
      await providerCall(normalized);
    };

    await expect(validateThenCall("https://acme-store.com/?q=1")).rejects.toBeInstanceOf(
      UnsupportedBacklinksTargetError,
    );
    expect(providerCall).not.toHaveBeenCalled();
  });
});
