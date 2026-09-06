import { describe, expect, it } from "vitest";
import { sanitizeErrorReport } from "./sanitize-error-report";

describe("sanitizeErrorReport", () => {
  it("replaces the project ref and strips the view query and fragment", () => {
    const sanitized = sanitizeErrorReport({
      digest: "err_1",
      message: "Failed to render",
      name: "Error",
      occurredAt: "18:00:00 UTC",
      pathname: "/app/prj_abc/rank-tracker?cursor=x#recent",
      stack: "Error: Failed to render",
    });

    expect(sanitized.pathname).toBe("/app/<project>/rank-tracker");
    expect(sanitized).toMatchObject({
      digest: "err_1",
      name: "Error",
      occurredAt: "18:00:00 UTC",
    });
  });

  it("redacts the market id while keeping the shape of a market-scoped report", () => {
    // Dropping the segment would be just as private and would make a market-scoped failure
    // indistinguishable from a project-level one.
    const sanitized = sanitizeErrorReport({
      message: "Failed to render",
      pathname: "/app/prj_abc/m/pmkt_def/rank-tracker?cursor=x#recent",
    });

    expect(sanitized.pathname).toBe("/app/<project>/m/<market>/rank-tracker");
  });

  it("redacts the reserved engine axis and keeps the deferred context marker", () => {
    expect(
      sanitizeErrorReport({ message: "boom", pathname: "/app/prj_abc/e/gpt/ai-citations" })
        .pathname,
    ).toBe("/app/<project>/e/<engine>/ai-citations");
    expect(
      sanitizeErrorReport({ message: "boom", pathname: "/app/prj_abc/~/rank-tracker" }).pathname,
    ).toBe("/app/<project>/~/rank-tracker");
  });

  it("keeps redacting a market-scoped URL inside a stack line", () => {
    const sanitized = sanitizeErrorReport({
      message: "boom",
      pathname: "/app/prj_abc/rank-tracker",
      stack:
        "Error: boom\n    at load (https://app.example.test/app/prj_abc/m/pmkt_def/rank-tracker?connect=secret)",
    });

    expect(sanitized.stack).toContain(
      "https://app.example.test/app/<project>/m/<market>/rank-tracker",
    );
    expect(sanitized.stack).not.toContain("pmkt_def");
    expect(sanitized.stack).not.toContain("prj_abc");
  });

  it("strips query strings and fragments from URLs in messages and stack lines", () => {
    const sanitized = sanitizeErrorReport({
      message: "Request failed at https://api.example.test/search?cursor=secret#response",
      pathname: "/app/prj_abc/rank-tracker",
      stack:
        "Error: request failed\n    at load (https://app.example.test/app/prj_abc/rank-tracker?connect=secret#step:12:4)",
    });

    expect(sanitized.message).toBe("Request failed at https://api.example.test/search");
    expect(sanitized.stack).toContain("https://app.example.test/app/<project>/rank-tracker");
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
