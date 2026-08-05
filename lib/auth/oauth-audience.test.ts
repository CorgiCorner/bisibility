import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/deployment/runtime-env.generated", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { AUTH_URL, auth, MCP_RESOURCE_URL } from "./auth";

type OauthProviderPlugin = {
  id?: string;
  options?: { validAudiences?: string[] };
};

function oauthProviderOptions() {
  const plugins = (auth.options as { plugins?: OauthProviderPlugin[] }).plugins ?? [];
  const plugin = plugins.find((candidate) => candidate.id === "oauth-provider");
  if (!plugin?.options) throw new Error("The OAuth provider plugin is not configured.");
  return plugin.options;
}

describe("OAuth provider audiences", () => {
  it("accepts exactly one resource, so a grant cannot be redeemed for another audience", () => {
    expect(oauthProviderOptions().validAudiences).toEqual([MCP_RESOURCE_URL]);
  });

  it("does not accept the authorization server itself as a resource", () => {
    expect(oauthProviderOptions().validAudiences).not.toContain(AUTH_URL);
  });

  it("keeps the MCP resource distinct from the authorization server", () => {
    expect(MCP_RESOURCE_URL).not.toBe(AUTH_URL);
  });
});
