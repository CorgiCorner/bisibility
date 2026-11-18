import "server-only";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import {
  AssistantRequestError,
  assertAssistantOrigin,
  assistantEnabled,
  assistantErrorResponse,
  assistantOpaqueId,
  assistantPrincipal,
  assistantProject,
  recordAssistantAction,
} from "./access";
import { expireAssistantApprovals } from "./approval-expiry";
import { assistantJson } from "./http";
import { parseAssistantModels } from "./model-config";
import { assistantRunStream } from "./run-stream";
import { decideAssistantTool } from "./tool-approval";
import { executeApprovedAssistantTool } from "./tool-execution";
import { assistantTransaction } from "./transaction";
import { startAssistantTurn } from "./turn-start";
import { assistantToolCallView } from "./views";
import { toolDecisionSchema } from "./wire";

function requireEnabled() {
  if (!assistantEnabled()) throw new AssistantRequestError("not_configured", 503);
}
export async function postAssistantTurn(req: Request) {
  try {
    assertAssistantOrigin(req);
    requireEnabled();
    const principal = await assistantPrincipal();
    const started = await startAssistantTurn(principal.userId, await assistantJson(req));
    if (started.duplicate)
      return Response.json(
        {
          code: "duplicate_request",
          message: "duplicate_request",
          runId: started.runId,
          conversationId: started.conversationId,
        },
        { status: 409 },
      );
    await recordAssistantAction(principal);
    return assistantRunStream(
      {
        run: started.run,
        assistantMessage: started.assistantMessage,
        userMessage: started.userMessage,
        project: started.project,
        model: started.model,
        principal,
        userText: started.userText,
        context: started.request.context,
        retry: Boolean(started.request.retryOfRunId),
      },
      req,
    );
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
export async function postAssistantDecision(req: Request, id: string) {
  try {
    assertAssistantOrigin(req);
    requireEnabled();
    id = assistantOpaqueId(id);
    const principal = await assistantPrincipal();
    const decision = toolDecisionSchema.parse(await assistantJson(req));
    const target = await prisma.assistantToolCall.findFirst({
      where: { id, userId: principal.userId },
      select: { runId: true },
    });
    if (target) await assistantTransaction((tx) => expireAssistantApprovals(tx, target.runId));
    const changed = await assistantTransaction((tx) =>
      decideAssistantTool(tx, { toolCallId: id, userId: principal.userId, decision }),
    );
    await recordAssistantAction(principal);
    if (changed.status === "approved") {
      try {
        await executeApprovedAssistantTool(id, principal);
      } catch {
        await prisma.assistantToolCall.updateMany({
          where: { id, userId: principal.userId, status: "approved" },
          data: { status: "blocked" },
        });
      }
    }
    const call = await prisma.assistantToolCall.findFirst({
      where: { id, userId: principal.userId },
      include: { run: true },
    });
    if (!call) throw new AssistantRequestError("approval_conflict", 409);
    const view = assistantToolCallView(call);
    if (call.status === "unknown" || call.status === "running") return Response.json(view);
    const pending = await prisma.assistantToolCall.count({
      where: { runId: call.runId, status: { in: ["proposed", "approved", "running", "unknown"] } },
    });
    if (pending) return Response.json(view);
    const run = await prisma.assistantRun.findUniqueOrThrow({ where: { id: call.runId } });
    const projectRef = await prisma.project.findUnique({
      where: { id: run.projectId },
      select: { publicId: true },
    });
    if (!projectRef) throw new AssistantRequestError("permission_denied", 404);
    const project = await assistantProject(projectRef.publicId, principal.userId);
    const model = parseAssistantModels(process.env.ASSISTANT_MODELS_JSON)?.find(
      (item) => item.id === run.modelId && item.provider === run.provider,
    );
    if (!model) throw new AssistantRequestError("model_unavailable", 503);
    const assistantMessage = await prisma.assistantMessage.findFirst({
      where: { runId: run.id, role: "assistant" },
      orderBy: { seq: "asc" },
    });
    const userMessage = await prisma.assistantMessage.findFirst({
      where: { conversationId: run.conversationId, role: "user" },
      orderBy: { seq: "desc" },
    });
    const parts = z
      .array(z.object({ type: z.literal("text"), text: z.string() }))
      .safeParse(userMessage?.parts);
    const userText = parts.success ? parts.data.map((part) => part.text).join("") : "";
    if (!assistantMessage || !userText) throw new AssistantRequestError("invalid_request", 400);
    const claim = await prisma.assistantRun.updateMany({
      where: { id: call.runId, userId: principal.userId, status: "awaiting_approval" },
      data: { status: "running_tool" },
    });
    if (claim.count !== 1) return Response.json(view);
    return assistantRunStream(
      {
        run: { ...run, status: "running_tool" },
        assistantMessage,
        userMessage: null,
        project,
        model,
        principal,
        userText,
        retry: false,
        initialToolCall: view,
      },
      req,
    );
  } catch (error) {
    return assistantErrorResponse(error);
  }
}
