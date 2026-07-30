import { afterEach, describe, expect, it, vi } from "vitest";
import { deferredReasonLabel, keywordLabel, projectLabel, suppressedEventLabel } from "./labels";

describe("operator Slack tenant labels", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns identifiers only by default", () => {
    vi.stubEnv("OPS_SLACK_INCLUDE_NAMES", "");

    expect(keywordLabel("keyword_1", "private keyword text")).toBe("keyword_1");
    expect(projectLabel("project_1", "Private project name")).toBe("project_1");
  });

  it("includes tenant names only after explicit opt-in", () => {
    vi.stubEnv("OPS_SLACK_INCLUDE_NAMES", "1");

    expect(keywordLabel("keyword_1", "private keyword text")).toBe(
      "keyword_1 (private keyword text)",
    );
    expect(projectLabel("project_1", "Private project name")).toBe(
      "Private project name [project_1]",
    );
    expect(projectLabel("project_1", "Private project name", "example.com")).toBe(
      "example.com [project_1]",
    );
    expect(projectLabel("project_1", null, null)).toBe("project_1");
  });

  it("maps free-form deferred reasons onto stable status identifiers", () => {
    expect(deferredReasonLabel("Rate limited for customer@example.eu")).toBe("rate_limited");
    expect(deferredReasonLabel("Monthly budget reached for tenant.example")).toBe(
      "budget_exhausted",
    );
    expect(deferredReasonLabel("Project is in read-only mode.")).toBe("project_read_only");
    expect(deferredReasonLabel("Private policy for tenant.example")).toBe("deferred");
  });

  it("allows only identifier-based throttle keys into the digest", () => {
    expect(suppressedEventLabel("rank:keyword_1:serpapi")).toBe("rank:keyword_1:serpapi");
    expect(suppressedEventLabel("sync:project_1:google-search-console")).toBe(
      "sync:project_1:google-search-console",
    );
    expect(suppressedEventLabel("rank:customer@example.eu:serpapi")).toBe("other");
    expect(suppressedEventLabel("private tenant domain")).toBe("other");
  });
});
