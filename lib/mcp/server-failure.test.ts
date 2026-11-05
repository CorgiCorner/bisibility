import { withRequestFailureContext } from "@/lib/observability/request-failure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), handler: vi.fn() }));
vi.mock("./tools", () => ({ dispatchMcpTool: mocks.dispatch }));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    server = {
      setRequestHandler: (_schema: unknown, handler: typeof mocks.handler) => {
        mocks.handler = handler;
      },
    };
  },
}));

import { errorFromUnknown } from "@/lib/api/error-mapper";
import { RankCheckRunnerError } from "@/lib/rank-check/runner-error";
import { createBisibilityMcpServer } from "./server";

describe("tool failure diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createBisibilityMcpServer({ authorization: "bsb_key_test_example" });
  });
  afterEach(() => vi.restoreAllMocks());

  async function call() {
    return withRequestFailureContext(new AbortController().signal, () =>
      mocks.handler({
        params: { name: "list_projects", arguments: { private: "person@example.com test-secret" } },
      }),
    );
  }

  it("logs thrown failures with their cause and no tool arguments", async () => {
    mocks.dispatch.mockRejectedValueOnce(
      new Error("test-secret", {
        cause: Object.assign(new Error("person@example.com"), { code: "ECONNRESET" }),
      }),
    );
    expect(await call()).toMatchObject({ isError: true });
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({
        phase: "tool_dispatch",
        httpStatus: 200,
        causes: expect.arrayContaining([expect.objectContaining({ code: "ECONNRESET" })]),
      }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("test-secret");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("person@example.com");
  });

  it("logs non-OK tool results without their response bodies", async () => {
    mocks.dispatch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      payload: { detail: "test-secret" },
    });
    expect(await call()).toMatchObject({ isError: true });
    expect(console.error).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("test-secret");
  });

  it("retains the original REST-mapped cause once instead of logging a generic duplicate", async () => {
    mocks.dispatch.mockImplementationOnce(async () => {
      const response = errorFromUnknown(
        Object.assign(new Error("SQL test-secret"), { code: "P2024" }),
        new Headers(),
        new URL("https://example.org/api/v1/projects"),
      );
      return { ok: false, status: response.status, payload: await response.json() };
    });
    expect(await call()).toMatchObject({ isError: true });
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({
        phase: "api_dispatch",
        causes: expect.arrayContaining([expect.objectContaining({ code: "P2024" })]),
      }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("test-secret");
  });

  it("keeps routine HTTP refusals out of exception logs", async () => {
    mocks.dispatch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      payload: { detail: "Forbidden" },
    });
    expect(await call()).toMatchObject({ isError: true });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps a tool rejection after client cancellation out of exception logs", async () => {
    const client = new AbortController();
    mocks.dispatch.mockImplementationOnce(() => {
      client.abort();
      throw new Error("late tool failure");
    });
    const result = await withRequestFailureContext(client.signal, () =>
      mocks.handler({ params: { name: "list_projects" } }),
    );
    expect(result).toMatchObject({ isError: true });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("retains the original cause of typed REST 502 responses", async () => {
    mocks.dispatch.mockImplementationOnce(async () => {
      const response = errorFromUnknown(
        new RankCheckRunnerError("provider_failed", "private error", {
          cause: Object.assign(new Error("private address"), { code: "ECONNRESET" }),
        }),
        new Headers(),
        new URL("https://example.org/api/v1/projects"),
      );
      return { ok: false, status: response.status, payload: await response.json() };
    });
    expect(await call()).toMatchObject({ isError: true });
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({
        phase: "api_dispatch",
        status: 502,
        causes: expect.arrayContaining([expect.objectContaining({ code: "ECONNRESET" })]),
      }),
    );
  });

  it("reports independent batch failures while retaining one HTTP correlation ID", async () => {
    mocks.dispatch.mockResolvedValue({
      ok: false,
      status: 500,
      payload: { detail: "private response" },
    });
    await withRequestFailureContext(new AbortController().signal, async () => {
      await Promise.all([
        mocks.handler({ params: { name: "list_projects" } }),
        mocks.handler({ params: { name: "list_providers" } }),
      ]);
    });
    expect(console.error).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(console.error).mock.calls;
    expect(calls[0][1].correlationId).toBe(calls[1][1].correlationId);
    expect(calls[0][1].operationId).not.toBe(calls[1][1].operationId);
    expect(calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ rpcMethod: "tools/call", toolName: "list_projects" }),
      expect.objectContaining({ rpcMethod: "tools/call", toolName: "list_providers" }),
    ]);
    expect(JSON.stringify(calls)).not.toContain("private response");
  });
});
