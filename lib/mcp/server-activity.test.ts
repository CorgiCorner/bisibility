import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBisibilityMcpServer } from "./server";

const mocks = vi.hoisted(() => ({ activity: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/activity/record-extension", () => ({ recordUserActivity: mocks.activity }));
vi.mock("./tools", () => ({ dispatchMcpTool: mocks.dispatch }));
vi.mock("./definitions", () => ({
  getMcpToolDefinitions: () => [
    {
      name: "mutate",
      inputSchema: { type: "object", properties: { estimate_only: { type: "boolean" } } },
      annotations: { readOnlyHint: false },
    },
    { name: "read", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  ],
}));
let client: Client;
let server: ReturnType<typeof createBisibilityMcpServer>;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.dispatch.mockResolvedValue({ ok: true, payload: { id: "result" }, status: 201 });
  server = createBisibilityMcpServer({
    authorization: "fixture",
    activityUser: { id: "user", email: "user@example.invalid" },
  });
  client = new Client({ name: "activity-fixture", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
});
afterEach(async () => {
  await client.close();
  await server.close();
});
describe("MCP activity authorization", () => {
  it.each([401, 403, 404, 500])("does not record a rejected dispatch (%s)", async (status) => {
    mocks.dispatch.mockResolvedValue({ ok: false, status, payload: { detail: "Denied" } });
    expect((await client.callTool({ name: "mutate" })).isError).toBe(true);
    expect(mocks.activity).not.toHaveBeenCalled();
  });
  it("does not record an unknown tool", async () => {
    mocks.dispatch.mockRejectedValue(new Error("Unknown MCP tool: unknown"));
    expect((await client.callTool({ name: "unknown" })).isError).toBe(true);
    expect(mocks.activity).not.toHaveBeenCalled();
  });
  it("does not record a thrown dispatch failure", async () => {
    mocks.dispatch.mockRejectedValue(new Error("fixture failure"));
    expect((await client.callTool({ name: "mutate" })).isError).toBe(true);
    expect(mocks.activity).not.toHaveBeenCalled();
  });
  it("records exactly once after a successful mutating dispatch", async () => {
    mocks.dispatch.mockImplementation(async () => {
      expect(mocks.activity).not.toHaveBeenCalled();
      return { ok: true, payload: { id: "result" }, status: 201 };
    });
    expect((await client.callTool({ name: "mutate" })).isError).not.toBe(true);
    expect(mocks.activity).toHaveBeenCalledExactlyOnceWith({
      userId: "user",
      email: "user@example.invalid",
      channel: "mcp",
      kind: "acted",
      interactive: true,
    });
  });
  it.each([{ name: "read" }, { name: "mutate", arguments: { estimate_only: true } }])(
    "does not record reads or estimates ($name)",
    async (input) => {
      await client.callTool(input);
      expect(mocks.activity).not.toHaveBeenCalled();
    },
  );
});
