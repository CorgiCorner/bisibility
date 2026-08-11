import { describe, expect, it } from "vitest";
import { sanitizeErrorReport } from "./sanitize-error-report";

describe("sanitizeErrorReport", () => {
  it("replaces the project ref and strips the view query and fragment", () => {
    const sanitized = sanitizeErrorReport({
      digest: "err_1",
      message: "Failed to render",
      name: "Error",
      occurredAt: "18:00:00 UTC",
      pathname: "/app/prj_abc/keywords?cursor=x#recent",
      stack: "Error: Failed to render",
    });

    expect(sanitized.pathname).toBe("/app/<project>/keywords");
    expect(sanitized).toMatchObject({
      digest: "err_1",
      name: "Error",
      occurredAt: "18:00:00 UTC",
    });
  });

  it("strips query strings and fragments from URLs in messages and stack lines", () => {
    const sanitized = sanitizeErrorReport({
      message: "Request failed at https://api.example.test/search?cursor=secret#response",
      pathname: "/app/prj_abc/keywords",
      stack:
        "Error: request failed\n    at load (https://app.example.test/app/prj_abc/keywords?connect=secret#step:12:4)",
    });

    expect(sanitized.message).toBe("Request failed at https://api.example.test/search");
    expect(sanitized.stack).toContain("https://app.example.test/app/<project>/keywords");
    expect(sanitized.stack).not.toContain("connect=secret");
  });

  it("redacts sc-domain values because a Search Console property identifies the customer", () => {
    const sanitized = sanitizeErrorReport({
      message: "Search Console rejected sc-domain:acme.example",
      pathname: "/app/prj_abc/integrations",
      stack: "Error: property sc-domain:acme.example is unavailable",
    });

    expect(sanitized.message).toBe("Search Console rejected sc-domain:<redacted>");
    expect(sanitized.stack).toBe("Error: property sc-domain:<redacted> is unavailable");
  });
});
