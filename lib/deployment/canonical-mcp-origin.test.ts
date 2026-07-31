import { describe, expect, it } from "vitest";
import { assertCanonicalHostedMcpOrigin } from "./canonical-mcp-origin";

describe("canonical hosted MCP origin startup guard", () => {
  it("accepts matching configured origins", () => {
    expect(() =>
      assertCanonicalHostedMcpOrigin({
        BETTER_AUTH_URL: "https://app.example.com/",
        DEPLOYMENT_MODE: "cloud",
        NEXT_RUNTIME: "nodejs",
        SITE_URL: "https://app.example.com",
      }),
    ).not.toThrow();
  });

  it("rejects different canonical and authorization origins", () => {
    expect(() =>
      assertCanonicalHostedMcpOrigin({
        BETTER_AUTH_URL: "https://auth.example.com",
        DEPLOYMENT_MODE: "cloud",
        NEXT_RUNTIME: "nodejs",
        SITE_URL: "https://site.example.com",
      }),
    ).toThrow("SITE_URL and BETTER_AUTH_URL must use the same origin");
  });

  it("rejects missing hosted origin configuration", () => {
    expect(() =>
      assertCanonicalHostedMcpOrigin({
        DEPLOYMENT_MODE: "cloud",
        NEXT_RUNTIME: "nodejs",
        SITE_URL: "https://site.example.com",
      }),
    ).toThrow("SITE_URL and BETTER_AUTH_URL must both be configured");
  });

  it("does not enforce hosted origin alignment during a production build", () => {
    expect(() =>
      assertCanonicalHostedMcpOrigin({
        BETTER_AUTH_URL: "https://auth.example.com",
        DEPLOYMENT_MODE: "cloud",
        NEXT_PHASE: "phase-production-build",
        NEXT_RUNTIME: "nodejs",
        SITE_URL: "https://site.example.com",
      }),
    ).not.toThrow();
  });

  it("does not enforce the hosted invariant for self-hosted deployments", () => {
    expect(() =>
      assertCanonicalHostedMcpOrigin({
        BETTER_AUTH_URL: "https://auth.example.com",
        DEPLOYMENT_MODE: "self-host",
        NEXT_RUNTIME: "nodejs",
        SITE_URL: "https://site.example.com",
      }),
    ).not.toThrow();
  });
});
