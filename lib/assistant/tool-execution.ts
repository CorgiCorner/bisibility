import "server-only";
import type { NativeSessionPrincipal } from "@/lib/api/native-session";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { mcpToolRestCall } from "@/lib/mcp/tools";
import { assistantReadOnly } from "./read-only";
import { AssistantApprovalError } from "./tool-approval";
import { assistantArgsHash, bindAssistantToolArgs } from "./tool-arguments";
import { dispatchBoundRestCall } from "./tool-dispatch";
import { assistantToolHasCostCeiling, findAssistantTool } from "./tool-policy";
import { assistantTransaction } from "./transaction";

/** Claim is one-shot. A crash after this CAS is unknown, never an automatic replay. */
export async function executeApprovedAssistantTool(
  callId: string,
  principal: NativeSessionPrincipal,
) {
  const claimed = await assistantTransaction(async (tx) => {
    const call = await tx.assistantToolCall.findUnique({
      where: { id: callId },
      include: { run: { include: { conversation: true } } },
    });
    if (
      call?.status !== "approved" ||
      call.userId !== principal.userId ||
      call.run.userId !== principal.userId ||
      call.run.projectId !== call.projectId ||
      call.run.conversationId !== call.conversationId ||
      call.run.conversation.activeRunId !== call.runId ||
      call.run.conversation.userId !== principal.userId ||
      call.run.conversation.projectId !== call.projectId ||
      call.expiresAt <= new Date()
    )
      throw new AssistantApprovalError("approval_conflict");
    const [project, membership] = await Promise.all([
      tx.project.findUnique({
        where: { id: call.projectId },
        select: { publicId: true, writeMode: true },
      }),
      tx.membership.findUnique({
        where: { userId_projectId: { userId: principal.userId, projectId: call.projectId } },
        select: { id: true, role: true },
      }),
    ]);
    if (!project || !membership) throw new AssistantApprovalError("permission_denied");
    // The role is read again at execution: a downgrade after approval refuses the write.
    if (assistantReadOnly(project.writeMode, membership.role))
      throw new AssistantApprovalError("permission_denied");
    const args = bindAssistantToolArgs(call.args, project.publicId);
    if (assistantArgsHash(args) !== call.argsHash)
      throw new AssistantApprovalError("approval_conflict");
    const tool = findAssistantTool(call.toolName);
    if (
      !tool ||
      tool.category !== call.category ||
      tool.category === "read" ||
      tool.category === "excluded"
    )
      throw new AssistantApprovalError("permission_denied");
    const rest = mcpToolRestCall(call.toolName, args);
    if (tool.category === "paid" && assistantToolHasCostCeiling(tool.tool)) {
      const query = new URL(`https://assistant.local${rest.path}`).searchParams.get(
        "max_cost_cents",
      );
      const body =
        rest.body && typeof rest.body === "object" && !Array.isArray(rest.body)
          ? Reflect.get(rest.body, "max_cost_cents")
          : undefined;
      if (
        call.maxCostCents === null ||
        (String(query) !== String(call.maxCostCents) && String(body) !== String(call.maxCostCents))
      )
        throw new AssistantApprovalError("permission_denied");
    }
    const changed = await tx.assistantToolCall.updateMany({
      where: {
        id: call.id,
        userId: principal.userId,
        status: "approved",
        argsHash: call.argsHash,
        maxCostCents: call.maxCostCents,
        expiresAt: { gt: new Date() },
      },
      data: { status: "running" },
    });
    if (changed.count !== 1) throw new AssistantApprovalError("approval_conflict");
    return { call, project, rest };
  });
  try {
    const result = await dispatchBoundRestCall(
      claimed.rest,
      principal,
      claimed.project.publicId,
      callId,
    );
    const status = result.ok ? "completed" : result.status >= 500 ? "unknown" : "failed";
    await assistantTransaction(async (tx) => {
      const updated = await tx.assistantToolCall.updateMany({
        where: { id: callId, status: "running" },
        data: {
          status,
          result: {
            providerCallId:
              claimed.call.result &&
              typeof claimed.call.result === "object" &&
              !Array.isArray(claimed.call.result) &&
              typeof claimed.call.result.providerCallId === "string"
                ? claimed.call.result.providerCallId
                : null,
            ok: result.ok,
            status: result.status,
            payload: result.payload,
          } as Prisma.InputJsonObject,
        },
      });
      if (updated.count !== 1) throw new AssistantApprovalError("approval_conflict");
      await writeAudit(
        {
          action: "assistant.tool.executed",
          actorId: principal.userId,
          projectId: claimed.call.projectId,
          targetType: "project",
          targetId: claimed.project.publicId,
          status: result.ok ? "success" : "failed",
        },
        tx,
      );
    });
    return { status, result };
  } catch (cause) {
    await prisma.assistantToolCall.updateMany({
      where: { id: callId, status: "running" },
      data: { status: "unknown" },
    });
    throw cause;
  }
}
