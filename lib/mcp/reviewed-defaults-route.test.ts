import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/router", () => ({
  handleApiRequest: async (request: Request) =>
    Response.json({
      method: request.method,
      url: request.url,
      body: await request.json(),
      authorization: request.headers.get("authorization"),
    }),
  handleMcpPreauthenticatedApiRequest: vi.fn(),
}));

import { dispatchMcpTool } from "./tools";

const projectId = `prj_${"a".repeat(24)}`;
describe("served MCP reviewed defaults transport", () => {
  it("the dedicated preview tool cannot be changed into a write by its input", async () => {
    const result = await dispatchMcpTool(
      "preview_project_defaults",
      {
        project_id: projectId,
        frequency: "daily",
        preview_only: false,
      },
      "synthetic-key",
    );
    expect(result).toMatchObject({
      status: 200,
      payload: {
        method: "PATCH",
        url: `https://mcp.local/api/v1/projects/${projectId}/defaults?preview_only=true`,
        body: { frequency: "daily" },
        authorization: "Bearer synthetic-key",
      },
    });
  });
  it.each([true, false])(
    "forwards explicit preview_only=%s only in the query",
    async (previewOnly) => {
      const review = {
        expected_revision: "9007199254740993123",
        preview_token: "synthetic-opaque",
        expected_source_hash: "a".repeat(64),
        confirmed: true,
        idempotency_key: "same-review-command",
      };
      const result = await dispatchMcpTool(
        "update_project_defaults",
        { project_id: projectId, frequency: "daily", preview_only: previewOnly, review },
        "synthetic-key",
      );
      expect(result).toMatchObject({
        status: 200,
        payload: {
          method: "PATCH",
          url: `https://mcp.local/api/v1/projects/${projectId}/defaults?preview_only=${previewOnly}`,
          body: { frequency: "daily", review },
          authorization: "Bearer synthetic-key",
        },
      });
      expect(result.payload).not.toHaveProperty("body.preview_only");
    },
  );
  it("refuses malformed preview coercion before the REST handler", async () => {
    await expect(
      dispatchMcpTool(
        "update_project_defaults",
        { project_id: projectId, preview_only: "true" },
        "synthetic-key",
      ),
    ).rejects.toThrow("boolean");
  });
});
