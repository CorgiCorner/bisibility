import "server-only";
import { operationPolicyForRequest } from "@/lib/api/operation-policy";
import { scopesForRole } from "@/lib/api/personal-scope";
import { hasScope } from "@/lib/api/request-scope";
import { writeAudit } from "@/lib/auth/audit";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { mcpToolRestCall } from "@/lib/mcp/tools";
import { assistantArgsHash, bindAssistantToolArgs } from "./tool-arguments";
import { assistantToolHasCostCeiling, findAssistantTool } from "./tool-policy";
import { type AssistantErrorCode, toolDecisionSchema } from "./wire";

export class AssistantApprovalError extends Error {
  constructor(readonly code: AssistantErrorCode) {
    super(code);
  }
}
/** Highest cents a paid tool approval may carry. */
const ASSISTANT_TOOL_MAX_COST_CENTS = 500;

/** A proposal stores only server-bound canonical arguments and cannot authorize execution. */
export async function proposeAssistantTool(
  tx: Prisma.TransactionClient,
  input: {
    runId: string;
    userId: string;
    toolName: string;
    args: unknown;
    providerCallId?: string;
    estimatedCostCents?: number | null;
  },
  now = new Date(),
) {
  const run = await tx.assistantRun.findUnique({
    where: { id: input.runId },
    include: { conversation: true },
  });
  if (
    !run ||
    run.userId !== input.userId ||
    run.conversation.userId !== input.userId ||
    run.projectId !== run.conversation.projectId ||
    run.conversation.activeRunId !== run.id
  )
    throw new AssistantApprovalError("permission_denied");
  const [project, membership] = await Promise.all([
    tx.project.findUnique({ where: { id: run.projectId }, select: { publicId: true } }),
    tx.membership.findUnique({
      where: { userId_projectId: { userId: input.userId, projectId: run.projectId } },
      select: { role: true },
    }),
  ]);
  if (!project || !membership) throw new AssistantApprovalError("permission_denied");
  const tool = findAssistantTool(input.toolName);
  if (!tool || tool.category === "excluded" || tool.category === "read")
    throw new AssistantApprovalError("permission_denied");
  const args = bindAssistantToolArgs(input.args, project.publicId);
  let maxCostCents: number | null = null;
  if (tool.category === "paid" && assistantToolHasCostCeiling(tool.tool)) {
    const requested = args.max_cost_cents;
    if (
      requested !== undefined &&
      (typeof requested !== "number" || !Number.isSafeInteger(requested) || requested < 0)
    )
      throw new AssistantApprovalError("invalid_request");
    maxCostCents = Math.min(
      typeof requested === "number" ? requested : ASSISTANT_TOOL_MAX_COST_CENTS,
      ASSISTANT_TOOL_MAX_COST_CENTS,
    );
    args.max_cost_cents = maxCostCents;
  }
  return tx.assistantToolCall.create({
    data: {
      runId: run.id,
      conversationId: run.conversationId,
      projectId: run.projectId,
      userId: input.userId,
      toolName: input.toolName,
      result: input.providerCallId
        ? { providerCallId: input.providerCallId.slice(0, 200) }
        : undefined,
      args: args as Prisma.InputJsonObject,
      argsHash: assistantArgsHash(args),
      category: tool.category,
      maxCostCents,
      estimatedCostCents: input.estimatedCostCents ?? null,
      status: "proposed",
      expiresAt: new Date(now.getTime() + 600000),
    },
  });
}

/** Transaction-owned CAS; callers execute only after a successful, separately claimed approval. */
export async function decideAssistantTool(
  tx: Prisma.TransactionClient,
  input: { toolCallId: string; userId: string; decision: unknown },
  now = new Date(),
) {
  const decision = toolDecisionSchema.parse(input.decision);
  const call = await tx.assistantToolCall.findUnique({
    where: { id: input.toolCallId },
    include: { run: { include: { conversation: true } } },
  });
  if (call?.userId === input.userId && call.status === "expired")
    throw new AssistantApprovalError("approval_expired");
  if (
    !call ||
    call.userId !== input.userId ||
    call.run.userId !== input.userId ||
    call.run.projectId !== call.projectId ||
    call.run.conversationId !== call.conversationId ||
    call.run.conversation.activeRunId !== call.runId ||
    // A proposal streamed before its run reached awaiting_approval cannot be decided yet.
    call.run.status !== "awaiting_approval" ||
    call.run.conversation.userId !== input.userId ||
    call.run.conversation.projectId !== call.projectId
  )
    throw new AssistantApprovalError("approval_conflict");
  if (
    call.status !== "proposed" ||
    call.argsHash !== decision.argsHash ||
    call.maxCostCents !== decision.maxCostCents
  )
    throw new AssistantApprovalError("approval_conflict");
  if (call.expiresAt <= now) throw new AssistantApprovalError("approval_expired");
  const [project, membership] = await Promise.all([
    tx.project.findUnique({
      where: { id: call.projectId },
      select: { publicId: true, writeMode: true },
    }),
    tx.membership.findUnique({
      where: { userId_projectId: { userId: input.userId, projectId: call.projectId } },
      select: { role: true },
    }),
  ]);
  if (!project || !membership) throw new AssistantApprovalError("permission_denied");
  const args = bindAssistantToolArgs(call.args, project.publicId);
  if (assistantArgsHash(args) !== call.argsHash)
    throw new AssistantApprovalError("approval_conflict");
  const tool = findAssistantTool(call.toolName);
  if (
    !tool ||
    tool.category !== call.category ||
    tool.category === "excluded" ||
    tool.category === "read"
  )
    throw new AssistantApprovalError("permission_denied");
  if (decision.decision === "approve") {
    if (isProjectReadOnly(project.writeMode)) throw new AssistantApprovalError("project_read_only");
    const rest = mcpToolRestCall(call.toolName, args);
    const path = new URL(`https://assistant.local/api/v1${rest.path}`).pathname
      .replace(/^\/api\/v1\/?/, "")
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    const policy = operationPolicyForRequest(rest.method, path);
    if (
      !policy ||
      !hasScope(scopesForRole(membership.role), policy.requiredScope) ||
      (policy.capability &&
        !canProjectAction(
          membership.role,
          policy.capability.action,
          policy.capability.resourceType,
        ))
    )
      throw new AssistantApprovalError("permission_denied");
  }
  const status = decision.decision === "approve" ? "approved" : "denied";
  const changed = await tx.assistantToolCall.updateMany({
    where: {
      id: call.id,
      userId: input.userId,
      status: "proposed",
      argsHash: decision.argsHash,
      maxCostCents: decision.maxCostCents,
      expiresAt: { gt: now },
    },
    data: { status },
  });
  if (changed.count !== 1) throw new AssistantApprovalError("approval_conflict");
  await writeAudit(
    {
      action: `assistant.tool.${status}`,
      actorId: input.userId,
      projectId: call.projectId,
      targetType: "project",
      targetId: project.publicId,
    },
    tx,
  );
  return { id: call.id, status };
}
