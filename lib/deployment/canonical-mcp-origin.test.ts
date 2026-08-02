import { describe, expect, it } from "vitest";
import { assertCanonicalHostedMcpOrigin } from "./canonical-mcp-origin";
import {
  MANAGED_AUTHORIZATION_SERVER_ORIGIN,
  MANAGED_MCP_RESOURCE_ORIGIN,
} from "./mcp-origin-contract";

describe("canonical hosted MCP origin startup guard", () => {
  it("accepts the managed production resource and authorization split", () => {
    expect(() =>
      assertCanonicalHostedMcpOrigin({
        BETTER_AUTH_URL: MANAGED_AUTHORIZATION_SERVER_ORIGIN,
        DEPLOYMENT_ENV: "production",
        DEPLOYMENT_MODE: "cloud",
        NEXT_RUNTIME: "nodejs",
        SITE_URL: MANAGED_MCP_RESOURCE_ORIGIN,
      }),
    ).not.toThrow();
  });

  it("rejects a different managed production contract", () => {
    expect(() =>
      assertCanonicalHostedMcpOrigin({
        BETTER_AUTH_URL: "https://auth.example.com",
        DEPLOYMENT_ENV: "production",
        DEPLOYMENT_MODE: "cloud",
        NEXT_RUNTIME: "nodejs",
        SITE_URL: "https://site.example.com",
      }),
    ).toThrow("Managed production MCP requires the apex resource origin");
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

  it("accepts one origin for preview and self-hosted deployments", () => {
    for (const deploymentMode of ["cloud", "self-host"]) {
      expect(() =>
        assertCanonicalHostedMcpOrigin({
          BETTER_AUTH_URL: "https://app.example.com/",
          DEPLOYMENT_ENV: "preview",
          DEPLOYMENT_MODE: deploymentMode,
          NEXT_RUNTIME: "nodejs",
          SITE_URL: "https://app.example.com",
        }),
      ).not.toThrow();
    }
  });

  it("rejects split origins for self-hosted deployments", () => {
    expect(() =>
      assertCanonicalHostedMcpOrigin({
        BETTER_AUTH_URL: "https://auth.example.com",
        DEPLOYMENT_MODE: "self-host",
        NEXT_RUNTIME: "nodejs",
        SITE_URL: "https://site.example.com",
      }),
    ).toThrow("must use the same origin outside managed production");
  });
});
