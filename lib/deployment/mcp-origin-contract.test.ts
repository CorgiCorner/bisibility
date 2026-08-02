import { describe, expect, it } from "vitest";
import {
  MANAGED_MCP_RESOURCE_URL,
  normalizeAuthorizationServerOrigin,
  protectedResourceMetadataUrl,
  resolveMcpResourceUrl,
} from "./mcp-origin-contract";

describe("MCP origin contract", () => {
  it("normalizes the authorization server once to its HTTP origin", () => {
    expect(normalizeAuthorizationServerOrigin("https://auth.example.com/path/")).toBe(
      "https://auth.example.com",
    );
    expect(() => normalizeAuthorizationServerOrigin("urn:example:authorization-server")).toThrow(
      "Authorization server must use HTTP or HTTPS.",
    );
  });

  it("uses the fixed managed resource only in managed production", () => {
    expect(
      resolveMcpResourceUrl("https://auth.example.com", {
        DEPLOYMENT_ENV: "production",
        DEPLOYMENT_MODE: "cloud",
      }),
    ).toBe(MANAGED_MCP_RESOURCE_URL);

    for (const environment of [
      { DEPLOYMENT_ENV: "preview", DEPLOYMENT_MODE: "cloud" },
      { DEPLOYMENT_ENV: "production", DEPLOYMENT_MODE: "self-host" },
    ]) {
      expect(resolveMcpResourceUrl("https://auth.example.com", environment)).toBe(
        "https://auth.example.com/api/mcp",
      );
    }
  });

  it("derives protected-resource metadata from the resource identity", () => {
    expect(protectedResourceMetadataUrl("https://resource.example.com/api/mcp")).toBe(
      "https://resource.example.com/.well-known/oauth-protected-resource/api/mcp",
    );
  });
});
