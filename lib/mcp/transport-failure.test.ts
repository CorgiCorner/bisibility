import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  oauth: vi.fn(),
  limit: vi.fn(),
  client: vi.fn(),
  createServer: vi.fn(),
  connect: vi.fn(),
  handle: vi.fn(),
}));
vi.mock("@/lib/auth/auth", () => ({ MCP_RESOURCE_URL: "https://example.com/api/mcp" }));
vi.mock("@/lib/api/auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.limit,
  rateLimitExceeded: () =>
    Response.json(
      { status: 429, detail: "Rate limit exceeded." },
      {
        status: 429,
        headers: { "Retry-After": "60", "RateLimit-Remaining": "0" },
      },
    ),
}));
vi.mock("./oauth-auth", () => ({
  authenticateMcpOAuthRequest: mocks.oauth,
  isApiCredential: (value: string) => value.startsWith("bsb_"),
  requireBearerToken: (req: Request) => req.headers.get("authorization")?.slice(7),
}));
vi.mock("./client-version-gate", async (original) => ({
  ...(await original<typeof import("./client-version-gate")>()),
  resolveMcpClient: mocks.client,
}));
vi.mock("./server", () => ({ createBisibilityMcpServer: mocks.createServer }));
vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
  WebStandardStreamableHTTPServerTransport: class {
    handleRequest = mocks.handle;
  },
}));

import { ApiAuthError } from "@/lib/api/auth";
import { handleMcpHttpRequest } from "./transport";

function request(
  body: unknown = { jsonrpc: "2.0", id: 42, method: "tools/list" },
  token = "oauth-test",
) {
  return new Request("https://example.com/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("MCP awaited failure boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DSH_PLUGIN_MIN_VERSION", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.oauth.mockResolvedValue({
      auth: { kind: "personal_token", token: { id: "test" }, user: { id: "owner" } },
    });
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: { id: "test" },
      project: { ownerId: "owner" },
    });
    mocks.limit.mockResolvedValue({ success: true });
    mocks.client.mockResolvedValue({ client: "unknown", inferred: false });
    mocks.createServer.mockReturnValue({ connect: mocks.connect });
    mocks.connect.mockResolvedValue(undefined);
    mocks.handle.mockResolvedValue(Response.json({ jsonrpc: "2.0", id: 42, result: {} }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([
    ["OAuth auth", "oauth", "oauth_auth"],
    ["rate limit", "limit", "rate_limit"],
    ["client lookup", "client", "client_gate"],
    ["server connection", "connect", "server_connect"],
    ["rejected SDK request", "handle", "transport_handle"],
  ] as const)("normalizes %s rejection", async (_name, mock, stage) => {
    mocks[mock].mockRejectedValueOnce(new Error("planted private failure"));
    const response = await handleMcpHttpRequest(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBeNull();
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 42,
      error: { code: -32603 },
    });
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({ phase: stage }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("planted private");
    if (mock !== "handle") expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("contains synchronous server construction failures", async () => {
    mocks.createServer.mockImplementationOnce(() => {
      throw new TypeError("private construction data");
    });
    const response = await handleMcpHttpRequest(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ id: 42, error: { code: -32603 } });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each([
    ["tools/call", "list_projects", "tools/call", "list_projects"],
    ["tools/list", "list_projects", "tools/list", "unknown"],
    ["person@example.org", "list_projects", "unknown", "unknown"],
    ["tools/call", "test-secret", "tools/call", "unknown"],
    ["tools/call", "toString", "tools/call", "unknown"],
    [42, {}, "unknown", "unknown"],
  ])("bounds diagnostic method %j and tool %j", async (method, name, rpcMethod, toolName) => {
    mocks.oauth.mockRejectedValueOnce(new TypeError("failure"));
    const response = await handleMcpHttpRequest(
      request({
        id: "private-request-id",
        method,
        params: { name, arguments: { secret: "test-secret" } },
      }),
    );
    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({
        phase: "oauth_auth",
        causeClass: "TypeError",
        rpcMethod,
        toolName,
        status: 500,
      }),
    );
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    for (const secret of ["person@example.org", "test-secret", "private-request-id", "toString"])
      expect(logs).not.toContain(secret);
  });

  it.each(["bsb_key_test_example", "bsb_pat_live_example"])(
    "fails closed on credential lookup: %s",
    async (token) => {
      mocks.authenticateBearer.mockRejectedValueOnce(
        Object.assign(new Error("lookup"), { code: "P2024" }),
      );
      const response = await handleMcpHttpRequest(request(undefined, token));
      expect(response.status).toBe(503);
      expect(await response.json()).toHaveProperty("error.code", -32603);
      expect(mocks.limit).not.toHaveBeenCalled();
      expect(mocks.createServer).not.toHaveBeenCalled();
    },
  );

  it("keeps invalid credentials unauthorized", async () => {
    mocks.authenticateBearer.mockRejectedValueOnce(new ApiAuthError("Invalid API key."));
    const response = await handleMcpHttpRequest(request(undefined, "bsb_key_test_example"));
    expect(response.status).toBe(401);
    expect(await response.json()).toHaveProperty("error");
    expect(mocks.createServer).not.toHaveBeenCalled();
  });

  it("preserves the OAuth challenge and rate limit headers", async () => {
    mocks.oauth.mockResolvedValueOnce({
      response: Response.json(
        { detail: "Unauthorized" },
        {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer resource_metadata="https://example.com/metadata"',
          },
        },
      ),
    });
    const denied = await handleMcpHttpRequest(request());
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("resource_metadata");
    expect(await denied.json()).toHaveProperty("error");
    mocks.limit.mockResolvedValueOnce({ success: false });
    const limited = await handleMcpHttpRequest(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toHaveProperty("error");
    expect(mocks.createServer).not.toHaveBeenCalled();
  });

  it.each([42, "request-1", null, {}, [], true, 1.5])(
    "uses only safe scalar request IDs: %j",
    async (id) => {
      mocks.limit.mockRejectedValueOnce(new Error("failure"));
      const response = await handleMcpHttpRequest(
        request({ jsonrpc: "2.0", id, method: "tools/list" }),
      );
      const expected = typeof id === "string" || Number.isSafeInteger(id) ? id : null;
      expect((await response.json()).id).toBe(expected);
    },
  );

  it.each([{ jsonrpc: "2.0", method: "notifications/initialized" }, [{ id: 1 }]])(
    "uses null for notifications and batches: %j",
    async (body) => {
      mocks.limit.mockRejectedValueOnce(new Error("failure"));
      expect((await (await handleMcpHttpRequest(request(body))).json()).id).toBeNull();
    },
  );

  it("does not offer retries for a dependency failure after dispatch starts", async () => {
    mocks.handle.mockRejectedValueOnce(
      Object.assign(new Error("encode failed"), { code: "ECONNRESET" }),
    );
    const response = await handleMcpHttpRequest(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("adds support correlation to HTTP 200 tool errors without changing the body", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 42,
      result: { isError: true, content: [{ type: "text", text: "Provider request failed." }] },
    };
    mocks.handle.mockResolvedValueOnce(Response.json(body));
    const response = await handleMcpHttpRequest(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-bisibility-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(body);
  });

  it("does not classify schema errors as transient database outages", async () => {
    mocks.oauth.mockRejectedValueOnce(Object.assign(new Error("schema error"), { code: "P2021" }));
    const response = await handleMcpHttpRequest(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("preserves SDK validation envelopes and statuses", async () => {
    mocks.handle.mockResolvedValueOnce(
      Response.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        { status: 400 },
      ),
    );
    const response = await handleMcpHttpRequest(request());
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: { code: -32700 } });
  });

  it("keeps method and origin refusal ahead of authentication", async () => {
    const unsupported = await handleMcpHttpRequest(
      new Request("https://example.com/api/mcp", { method: "PATCH" }),
    );
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get("allow")).toBe("DELETE, GET, POST");
    expect(await unsupported.json()).toHaveProperty("error");
    const foreign = request();
    foreign.headers.set("origin", "https://example.org");
    const denied = await handleMcpHttpRequest(foreign);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toHaveProperty("error");
    expect(mocks.oauth).not.toHaveBeenCalled();
  });

  it("uses null for oversized IDs and never logs supplied identifiers", async () => {
    mocks.limit.mockRejectedValueOnce(new Error("failure"));
    const response = await handleMcpHttpRequest(request({ id: "private".repeat(20_000) }));
    expect((await response.json()).id).toBeNull();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
  });

  it("bounds ID recovery when a request body never closes", async () => {
    vi.useFakeTimers();
    mocks.limit.mockRejectedValueOnce(new Error("failure"));
    const req = new Request("https://example.com/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer oauth-test" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"id":'));
        },
      }),
      duplex: "half",
    } as RequestInit);
    const pending = handleMcpHttpRequest(req);
    await vi.advanceTimersByTimeAsync(200);
    const response = await pending;
    expect((await response.json()).id).toBeNull();
  });

  it("does not dispatch a timed-out pre-handler after its dependency eventually resolves", async () => {
    vi.useFakeTimers();
    let resolve: ((value: { success: boolean }) => void) | undefined;
    mocks.limit.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = handleMcpHttpRequest(request());
    await vi.advanceTimersByTimeAsync(30_100);
    const response = await pending;
    expect(response.status).toBe(503);
    resolve?.({ success: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.createServer).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "reuses verified credentials only for the account limiter: %s",
    async (accountScoped) => {
      mocks.limit.mockResolvedValue({ success: true, accountScoped });
      await handleMcpHttpRequest(request(undefined, "bsb_key_example"));
      const authorization = mocks.createServer.mock.calls[0][0].authorization;
      expect(authorization).toEqual(
        accountScoped
          ? {
              kind: "project_key",
              apiKey: { id: "test" },
              project: { ownerId: "owner" },
            }
          : "bsb_key_example",
      );
      expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(expect.any(Request), {
        id: "test",
        kind: "api-key",
        ownerId: "owner",
      });
    },
  );
});
