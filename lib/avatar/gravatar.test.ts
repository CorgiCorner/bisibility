import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { gravatarUrl } from "./gravatar";

describe("gravatarUrl", () => {
  it("produces a gravatar URL with a SHA-256 hash of the trimmed, lowercased email", () => {
    const url = gravatarUrl("John@example.com", 54);
    expect(url).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/[0-9a-f]{64}\?d=404&s=108$/);
  });

  it("normalizes email case and surrounding whitespace before hashing", () => {
    const a = gravatarUrl("  Alice@Example.com  ", 34);
    const b = gravatarUrl("alice@example.com", 34);
    expect(a).toBe(b);
  });

  it("doubles the rendered size for the s query parameter", () => {
    expect(gravatarUrl("a@b.com", 32)).toMatch(/s=64$/);
    expect(gravatarUrl("a@b.com", 54)).toMatch(/s=108$/);
    expect(gravatarUrl("a@b.com", 26)).toMatch(/s=52$/);
  });

  it("uses d=404 so a missing avatar returns an error for the fallback path", () => {
    expect(gravatarUrl("a@b.com", 34)).toMatch(/d=404/);
  });

  it("hashes an empty email without throwing", () => {
    expect(() => gravatarUrl("", 34)).not.toThrow();
  });

  it("produces a stable hash for the same email across calls", () => {
    const a = gravatarUrl("stable@example.com", 34);
    const b = gravatarUrl("stable@example.com", 34);
    expect(a).toBe(b);
  });
});
