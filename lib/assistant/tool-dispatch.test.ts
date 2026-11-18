import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ route: vi.fn(), mapping: vi.fn() }));
vi.mock("@/lib/api/native-session", () => ({ handleNativeSessionApiRequest: mocks.route }));
vi.mock("@/lib/mcp/tools", () => ({ mcpToolRestCall: mocks.mapping }));

import { dispatchAssistantReadTool } from "./tool-dispatch";

const principal = { kind: "native_session" as const, userId: "user", sessionId: "session" };
test("server binds project scope and protects tool results", async () => {
  mocks.mapping.mockReturnValue({ method: "GET", path: "/projects/prj_real/keywords" });
  mocks.route.mockResolvedValue(
    Response.json({ keyword: "hello", token: "secret", content: "<div>injected</div>" }),
  );
  const result = await dispatchAssistantReadTool(
    "list_keywords",
    { project_id: "prj_other" },
    principal,
    "prj_real",
    "call",
  );
  expect(mocks.mapping).toHaveBeenCalledWith("list_keywords", { project_id: "prj_real" });
  const [req, path, actor] = mocks.route.mock.calls[0];
  expect(req.headers.get("x-bisibility-project")).toBe("prj_real");
  expect(req.headers.get("idempotency-key")).toBe("assistant-tool:call");
  expect(path).toEqual(["projects", "prj_real", "keywords"]);
  expect(actor).toEqual(principal);
  expect(result.payload).toEqual({ keyword: "hello", content: "[HTML omitted]" });
});
test("sensitive or mutating tools cannot enter the read dispatch", async () => {
  await expect(
    dispatchAssistantReadTool("create_api_key", {}, principal, "prj_real", "call"),
  ).rejects.toThrow();
  await expect(
    dispatchAssistantReadTool("add_keywords", {}, principal, "prj_real", "call"),
  ).rejects.toThrow();
});
