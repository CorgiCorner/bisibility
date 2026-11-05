import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/router", () => ({
  handleApiRequest: async (request: Request) =>
    Response.json({
      client: request.headers.get("x-bisibility-client"),
      source: request.headers.get("x-bisibility-source"),
    }),
  handleMcpPreauthenticatedApiRequest: vi.fn(),
}));

import { dispatchMcpRestCall } from "./rest-call";

describe("MCP REST dispatch client attribution", () => {
  it("forwards the caller's client header next to the MCP source", async () => {
    const result = await dispatchMcpRestCall(
      { method: "GET", path: "/projects" },
      "synthetic-key",
      "bisibility-dsh-plugin/0.2.0",
    );
    expect(result.payload).toEqual({ client: "bisibility-dsh-plugin/0.2.0", source: "mcp" });
  });

  it("sends no client header when the caller sent none", async () => {
    const result = await dispatchMcpRestCall({ method: "GET", path: "/projects" }, "synthetic-key");
    expect(result.payload).toEqual({ client: null, source: "mcp" });
  });
});
