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
    [
      "G-Y67LRWFT7X",
      "G-Y67LRWFT7X is a Measurement ID. You need the numeric Property ID - they live on the same Google Analytics screen.",
    ],
    [
      "g-y67lrwft7x",
      "g-y67lrwft7x is a Measurement ID. You need the numeric Property ID - they live on the same Google Analytics screen.",
    ],
  ])("rejects Measurement ID %j with concise guidance", (input, message) => {
    expect(normalizeGa4PropertyId(input)).toEqual({
      error: { code: "measurement-id", message },
      ok: false,
    });
  });

  it.each(["UA-123456-1", "ua-123456-1"])(
    "rejects Universal Analytics ID %j with concise guidance",
    (input) => {
      expect(normalizeGa4PropertyId(input)).toEqual({
        error: {
          code: "universal-analytics",
          message: `${input} is a Universal Analytics tracking ID. You need the numeric Property ID - see the note above.`,
        },
        ok: false,
      });
    },
  );

  it("rejects an empty value with a dedicated message", () => {
    expect(normalizeGa4PropertyId("  ")).toEqual({
      error: { code: "empty", message: "Enter a Property ID first." },
      ok: false,
    });
  });

  it("rejects generic nonnumeric input without quoting or repeated navigation", () => {
    expect(normalizeGa4PropertyId(" not-a-property ")).toEqual({
      error: {
        code: "invalid",
        message:
          "not-a-property is not a Property ID. Property IDs are digits only - see the note above for where to find yours.",
      },
      ok: false,
    });
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
