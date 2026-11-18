import { describe, expect, it } from "vitest";
import { errorLogFields } from "./error-log-fields";

describe("errorLogFields", () => {
  it("extracts safe fields from an Error with code and status", () => {
    const error = Object.assign(new Error("Sitemap unavailable"), {
      code: "UNAVAILABLE",
      status: 503,
    });
    expect(errorLogFields(error)).toEqual({
      name: "Error",
      code: "UNAVAILABLE",
      status: 503,
      message: "Sitemap unavailable",
    });
  });

  it("extracts string and number fields from a plain object", () => {
    expect(
      errorLogFields({ name: 7, code: 429, status: "RESOURCE_EXHAUSTED", message: "Try later" }),
    ).toEqual({ name: 7, code: 429, status: "RESOURCE_EXHAUSTED", message: "Try later" });
  });

  it.each([undefined, null, "private context", 42, true, Symbol("error")])(
    "returns no fields for a non-object value %s",
    (error) => {
      expect(errorLogFields(error)).toEqual({});
    },
  );

  it("omits fields with unsupported value types", () => {
    expect(
      errorLogFields({ name: {}, code: false, status: [503], message: { text: "private" } }),
    ).toEqual({});
  });

  it("truncates the message to 300 characters", () => {
    expect(errorLogFields({ message: `${"x".repeat(300)}private suffix` })).toEqual({
      message: "x".repeat(300),
    });
  });

  it("omits transport context and returns only allowed keys", () => {
    const fields = errorLogFields({
      name: "ProviderError",
      code: "UNAVAILABLE",
      status: 503,
      message: "Sitemap unavailable",
      config: { headers: { Authorization: "Bearer test-secret" } },
      response: { data: "private response" },
      stack: "private stack",
    });
    expect(Object.keys(fields).sort()).toEqual(["code", "message", "name", "status"]);
    expect(fields).toEqual({
      name: "ProviderError",
      code: "UNAVAILABLE",
      status: 503,
      message: "Sitemap unavailable",
    });
    expect(JSON.stringify(fields)).not.toContain("test-secret");
    expect(JSON.stringify(fields)).not.toContain("private response");
  });
});
