import type { Prisma } from "@/lib/generated/prisma/client";
import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  rest: vi.fn(),
  policy: vi.fn(),
  capability: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/mcp/tools", () => ({ mcpToolRestCall: mocks.rest }));
vi.mock("@/lib/api/operation-policy", () => ({ operationPolicyForRequest: mocks.policy }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: mocks.capability }));

import { decideAssistantTool, proposeAssistantTool } from "./tool-approval";

const now = new Date("2026-01-01T00:00:00Z");
const requestId = "123e4567-e89b-42d3-a456-426614174000";
function fixture() {
  let call: Record<string, unknown> | undefined;
  const state = { role: "member", active: true };
  mocks.audit.mockReset().mockResolvedValue({});
  mocks.rest.mockReset().mockReturnValue({ method: "POST", path: "/projects/prj_real/keywords" });
  mocks.policy.mockReset().mockReturnValue({
    requiredScope: "write",
    projectAccess: "write",
    capability: { action: "create", resourceType: "keyword" },
  });
  mocks.capability.mockReturnValue(true);
  const run = {
    id: "run",
    userId: "user",
    projectId: "project",
    conversationId: "conversation",
    status: "awaiting_approval",
    conversation: { userId: "user", projectId: "project", activeRunId: "run" },
  };
  const tx = {
    assistantRun: { findUnique: vi.fn(async () => run) },
    project: { findUnique: vi.fn(async () => ({ publicId: "prj_real", writeMode: "active" })) },
    membership: { findUnique: vi.fn(async () => (state.active ? { role: state.role } : null)) },
    assistantToolCall: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        call = { ...data, id: "call", run };
        return call;
      }),
      findUnique: vi.fn(async () => call),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (
            !call ||
            call.status !== where.status ||
            call.argsHash !== where.argsHash ||
            call.maxCostCents !== where.maxCostCents
          )
            return { count: 0 };
          call.status = data.status;
          return { count: 1 };
        },
      ),
    },
  } as unknown as Prisma.TransactionClient;
  return {
    tx,
    state,
    get call() {
      return call;
    },
  };
}
test("tampering, expiry and double decisions are rejected", async () => {
  const f = fixture();
  const call = await proposeAssistantTool(
    f.tx,
    {
      runId: "run",
      userId: "user",
      toolName: "research_keywords",
      args: { project_id: "prj_other", max_cost_cents: 999 },
    },
    now,
  );
  expect(call.maxCostCents).toBe(500);
  expect(call.args).toMatchObject({ project_id: "prj_real", max_cost_cents: 500 });
  const decision = { decision: "approve", argsHash: call.argsHash, maxCostCents: 500, requestId };
  await expect(
    decideAssistantTool(
      f.tx,
      { toolCallId: call.id, userId: "user", decision: { ...decision, maxCostCents: 501 } },
      now,
    ),
  ).rejects.toMatchObject({ code: "approval_conflict" });
  await expect(
    decideAssistantTool(
      f.tx,
      { toolCallId: call.id, userId: "user", decision },
      new Date(now.getTime() + 600000),
    ),
  ).rejects.toMatchObject({ code: "approval_expired" });
  await expect(
    decideAssistantTool(f.tx, { toolCallId: call.id, userId: "user", decision }, now),
  ).resolves.toMatchObject({ status: "approved" });
  await expect(
    decideAssistantTool(f.tx, { toolCallId: call.id, userId: "user", decision }, now),
  ).rejects.toMatchObject({ code: "approval_conflict" });
});
test("viewer, revoked member and another user cannot approve a mutation", async () => {
  const f = fixture();
  const call = await proposeAssistantTool(
    f.tx,
    { runId: "run", userId: "user", toolName: "add_keywords", args: {} },
    now,
  );
  const decision = { decision: "approve", argsHash: call.argsHash, maxCostCents: null, requestId };
  f.state.role = "viewer";
  await expect(
    decideAssistantTool(f.tx, { toolCallId: call.id, userId: "user", decision }, now),
  ).rejects.toMatchObject({ code: "permission_denied" });
  f.state.role = "member";
  f.state.active = false;
  await expect(
    decideAssistantTool(f.tx, { toolCallId: call.id, userId: "user", decision }, now),
  ).rejects.toMatchObject({ code: "permission_denied" });
  await expect(
    decideAssistantTool(f.tx, { toolCallId: call.id, userId: "other", decision }, now),
  ).rejects.toMatchObject({ code: "approval_conflict" });
});
