import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  project: vi.fn(),
  member: vi.fn(),
  transaction: vi.fn(),
  send: vi.fn(),
  rest: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction, assistantToolCall: { updateMany: mocks.update } },
}));
vi.mock("@/lib/mcp/tools", () => ({ mcpToolRestCall: mocks.rest }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("./tool-dispatch", () => ({ dispatchBoundRestCall: mocks.send }));

import { assistantArgsHash, bindAssistantToolArgs } from "./tool-arguments";
import { executeApprovedAssistantTool } from "./tool-execution";

const principal = { kind: "native_session" as const, userId: "user", sessionId: "session" };
beforeEach(() => {
  vi.resetAllMocks();
  const args = bindAssistantToolArgs({ keywords: ["one"] }, "prj_real");
  const call = {
    id: "call",
    runId: "run",
    conversationId: "conversation",
    projectId: "project",
    userId: "user",
    toolName: "add_keywords",
    category: "mutation",
    status: "approved",
    args,
    argsHash: assistantArgsHash(args),
    maxCostCents: null,
    expiresAt: new Date(Date.now() + 60000),
    run: {
      userId: "user",
      projectId: "project",
      conversationId: "conversation",
      conversation: { userId: "user", projectId: "project", activeRunId: "run" },
    },
  };
  mocks.find.mockImplementation(async () => call);
  mocks.project.mockResolvedValue({ publicId: "prj_real" });
  mocks.member.mockResolvedValue({ id: "member", role: "member" });
  mocks.rest.mockReturnValue({
    method: "POST",
    path: "/projects/prj_real/keywords",
    body: { keywords: ["one"] },
  });
  mocks.update.mockImplementation(async ({ where, data }) => {
    if (call.status !== where.status) return { count: 0 };
    call.status = data.status;
    return { count: 1 };
  });
  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      assistantToolCall: { findUnique: mocks.find, updateMany: mocks.update },
      project: { findUnique: mocks.project },
      membership: { findUnique: mocks.member },
      auditLog: {},
    }),
  );
  mocks.send.mockResolvedValue({ ok: true, status: 200, payload: { summary: "done" } });
  mocks.audit.mockResolvedValue({});
});
test("only one approved execution reaches the native transport", async () => {
  expect((await executeApprovedAssistantTool("call", principal)).status).toBe("completed");
  await expect(executeApprovedAssistantTool("call", principal)).rejects.toMatchObject({
    code: "approval_conflict",
  });
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send.mock.calls[0][3]).toBe("call");
});
test("revoked membership prevents dispatch", async () => {
  mocks.member.mockResolvedValue(null);
  await expect(executeApprovedAssistantTool("call", principal)).rejects.toMatchObject({
    code: "permission_denied",
  });
  expect(mocks.send).not.toHaveBeenCalled();
});

test("a paid request without the approved ceiling on its REST call is blocked", async () => {
  const args = bindAssistantToolArgs({ seed: "example", max_cost_cents: 50 }, "prj_real");
  mocks.find.mockResolvedValue({
    id: "paid",
    runId: "run",
    conversationId: "conversation",
    projectId: "project",
    userId: "user",
    toolName: "research_keywords",
    category: "paid",
    status: "approved",
    args,
    argsHash: assistantArgsHash(args),
    maxCostCents: 50,
    expiresAt: new Date(Date.now() + 60000),
    run: {
      userId: "user",
      projectId: "project",
      conversationId: "conversation",
      conversation: { userId: "user", projectId: "project", activeRunId: "run" },
    },
  });
  mocks.rest.mockReturnValue({ method: "GET", path: "/projects/prj_real/keyword-research" });
  await expect(executeApprovedAssistantTool("paid", principal)).rejects.toMatchObject({
    code: "permission_denied",
  });
  expect(mocks.send).not.toHaveBeenCalled();
});
test("a role lowered to viewer after approval refuses the write before the transport", async () => {
  mocks.member.mockResolvedValue({ id: "member", role: "viewer" });
  await expect(executeApprovedAssistantTool("call", principal)).rejects.toMatchObject({
    code: "permission_denied",
  });
  expect(mocks.send).not.toHaveBeenCalled();
});
