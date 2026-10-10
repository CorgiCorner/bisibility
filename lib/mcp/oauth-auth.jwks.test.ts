// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateMcpOAuthRequest } from "./oauth-auth";

const mocks = vi.hoisted(() => ({ userFindUnique: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({
  AUTH_URL: "https://auth.example.com",
  AUTH_URL_CONFIGURED: true,
  MCP_RESOURCE_URL: "https://resource.example.com/api/mcp",
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

const syntacticJwt = [
  Buffer.from(JSON.stringify({ alg: "RS256", kid: "audit-fixture" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: "user_fixture" })).toString("base64url"),
  Buffer.from("signature").toString("base64url"),
].join(".");

describe("MCP OAuth verification availability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([404, 503])(
    "returns a safe unavailable response for real JWKS HTTP %s failures",
    async (status) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("https://auth.example.com/api/auth/jwks");
        return Response.json({ error: "fixture JWKS unavailable" }, { status });
      });
      vi.stubGlobal("fetch", fetchMock);
      const req = new Request("https://resource.example.com/api/mcp", {
        headers: { authorization: `Bearer ${syntacticJwt}` },
        method: "POST",
      });
      const result = await authenticateMcpOAuthRequest(req);
      if (!("response" in result)) throw new Error("Expected the rejected OAuth result.");
      expect(fetchMock).toHaveBeenCalled();
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        "https://auth.example.com/api/auth/jwks",
      );
      expect(result.response.status).toBe(503);
      expect(result.response.headers.get("www-authenticate")).toBeNull();
      expect(await result.response.json()).toMatchObject({
        detail:
          "OAuth token verification is unavailable. Check the authentication server configuration and availability.",
      });
      expect(mocks.userFindUnique).not.toHaveBeenCalled();
    },
  );
});
