import { describe, expect, it } from "vitest";
import {
  normalizeGa4PropertyId,
  normalizeGscProperty,
  normalizeStoredGscProperty,
} from "./property-id";

describe("normalizeGa4PropertyId", () => {
  it.each([
    ["123456789", "123456789"],
    ["properties/123456789", "123456789"],
    ["  123456789  ", "123456789"],
    ["  properties/123456789  ", "123456789"],
  ])("normalizes %j to a numeric property id", (input, expected) => {
    expect(normalizeGa4PropertyId(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["G-Y67LRWFT7X", "measurement-id", "Measurement ID"],
    ["g-y67lrwft7x", "measurement-id", "Measurement ID"],
    ["UA-123456-1", "universal-analytics", "Universal Analytics"],
    ["ua-123456-1", "universal-analytics", "Universal Analytics"],
    ["not-a-property", "invalid", "valid GA4 Property ID"],
    ["", "invalid", "valid GA4 Property ID"],
  ] as const)("rejects %j with %s", (input, code, expectedCopy) => {
    const result = normalizeGa4PropertyId(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(code);
    expect(result.error.message).toContain(JSON.stringify(input.trim()));
    expect(result.error.message).toContain(expectedCopy);
    expect(result.error.message).toContain("Admin (gear, bottom-left)");
    expect(result.error.message).toContain("Property settings -> Property details -> Property ID");
  });
});

describe("normalizeGscProperty", () => {
  it.each([
    "sc-domain:example.com",
    "sc-domain:www.example.com",
    "https://example.com/",
    "http://example.com/path?query=value",
  ])("accepts %j", (input) => {
    expect(normalizeGscProperty(input)).toEqual({ ok: true, value: input });
  });

  it("trims a valid property", () => {
    expect(normalizeGscProperty("  sc-domain:example.com  ")).toEqual({
      ok: true,
      value: "sc-domain:example.com",
    });
  });

  it.each([
    "example.com",
    "sc-domain:",
    "sc-domain:https://example.com",
    "ftp://example.com",
    "not a property",
    "",
  ])("rejects %j", (input) => {
    const result = normalizeGscProperty(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid");
    expect(result.error.message).toContain(JSON.stringify(input.trim()));
    expect(result.error.message).toContain("sc-domain:example.com");
    expect(result.error.message).toContain("http:// or https:// URL");
  });
});

describe("normalizeStoredGscProperty", () => {
  it("upgrades a legacy bare domain to its canonical domain property", () => {
    expect(normalizeStoredGscProperty(" Example.com ")).toEqual({
      ok: true,
      value: "sc-domain:example.com",
    });
  });

  it("keeps strict validation errors for malformed stored values", () => {
    expect(normalizeStoredGscProperty("not a property")).toMatchObject({
      error: { code: "invalid" },
      ok: false,
    });
  });
});
