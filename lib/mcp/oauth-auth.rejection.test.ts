import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMcpHttpRequest } from "./transport";

const mocks = vi.hoisted(() => ({ user: vi.fn(), server: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/observability/server-message", () => ({ reportServerMessage: mocks.report }));
vi.mock("@/lib/auth/auth", () => ({
  AUTH_URL: "https://auth.example.com",
  AUTH_URL_CONFIGURED: true,
  MCP_RESOURCE_URL: "https://resource.example.com/api/mcp",
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("./server", () => ({ createBisibilityMcpServer: mocks.server }));

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwk: Awaited<ReturnType<typeof exportJWK>>;
beforeAll(async () => {
  keys = await generateKeyPair("ES256");
  jwk = { ...(await exportJWK(keys.publicKey)), kid: "rejection-fixture" };
});
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MCP real verifier token rejection", () => {
  it.each(["expired", "audience", "issuer"] as const)(
    "returns an unauthorized envelope without server failure reporting for %s tokens",
    async (invalid) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ keys: [jwk] })),
      );
      const token = await new SignJWT({ scope: "read", sub: "user-fixture" })
        .setProtectedHeader({ alg: "ES256", kid: "rejection-fixture" })
        .setAudience(
          invalid === "audience"
            ? "https://example.org/api/mcp"
            : "https://resource.example.com/api/mcp",
        )
        .setIssuer(invalid === "issuer" ? "https://example.org" : "https://auth.example.com")
        .setExpirationTime(Math.floor(Date.now() / 1000) + (invalid === "expired" ? -60 : 300))
        .sign(keys.privateKey);
      const response = await handleMcpHttpRequest(
        new Request("https://resource.example.com/api/mcp", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 42, method: "tools/list" }),
        }),
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
      expect(response.headers.get("retry-after")).toBeNull();
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        id: 42,
        error: { code: -32603 },
      });
      expect(log).not.toHaveBeenCalled();
      expect(mocks.report).not.toHaveBeenCalled();
      expect(mocks.user).not.toHaveBeenCalled();
      expect(mocks.server).not.toHaveBeenCalled();
    },
  );
});
