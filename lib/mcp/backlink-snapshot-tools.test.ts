import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMcpToolDefinitions } from "./definitions";
import { dispatchMcpTool } from "./tools";

const mocks = vi.hoisted(() => ({ handleApiRequest: vi.fn() }));
vi.mock("@/lib/api/router", () => ({
  handleApiRequest: mocks.handleApiRequest,
  handleMcpPreauthenticatedApiRequest: vi.fn(),
}));
const projectId = "prj_a00000000000000000000000";
const input = { project_id: projectId, target: "example.com" };

beforeEach(() => vi.clearAllMocks());

describe("hosted MCP backlink snapshot references", () => {
  it("publishes the required opaque reference with bounds and guidance", () => {
    const tool = getMcpToolDefinitions().find((item) => item.name === "load_more_backlink_rows");
    if (!tool) throw new Error("Missing backlink pagination tool");
    expect(tool.inputSchema.required).toContain("snapshot_ref");
    expect(tool.inputSchema.properties).toMatchObject({
      snapshot_ref: {
        type: "string",
        minLength: 1,
        maxLength: 32768,
        description: expect.any(String),
      },
    });
    const validate = new AjvJsonSchemaValidator().getValidator(tool.inputSchema as never);
    expect(validate(input).valid).toBe(false);
    expect(validate({ ...input, snapshot_ref: "opaque-current" }).valid).toBe(true);
  });

  it.each([undefined, "", "x".repeat(32769)])(
    "rejects an invalid reference before REST dispatch",
    async (snapshot_ref) => {
      await expect(
        dispatchMcpTool("load_more_backlink_rows", { ...input, snapshot_ref }, "bsb_key_live_test"),
      ).rejects.toThrow("snapshot_ref");
      expect(mocks.handleApiRequest).not.toHaveBeenCalled();
    },
  );

  it("forwards the exact reference and preserves the replacement response reference", async () => {
    const reference = "-opaque/current+reference=";
    const payload = {
      data: { snapshot_ref: "opaque-next", fetched_row_count: 200 },
      meta: { source: "stored" },
    };
    mocks.handleApiRequest.mockResolvedValueOnce(Response.json(payload));
    const result = await dispatchMcpTool(
      "load_more_backlink_rows",
      { ...input, snapshot_ref: reference, limit: 100 },
      "bsb_key_live_test",
    );
    expect(result).toEqual({ ok: true, status: 200, payload });
    const [request, path] = mocks.handleApiRequest.mock.calls[0];
    expect(path).toEqual(["projects", projectId, "backlinks", "rows"]);
    expect(await request.json()).toEqual({
      target: "example.com",
      snapshot_ref: reference,
      limit: 100,
    });
  });
});
