import "server-only";
import type { NativeSessionPrincipal } from "@/lib/api/native-session";
import { hasProjectCapability } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import type { AssistantMessage, AssistantRun } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { AssistantRequestError, assistantProject } from "./access";
import { ASSISTANT_METERING_NAMESPACE, type AssistantAccountingBinding } from "./accounting-scope";
import { runAssistantEffort } from "./effort";
import { assistantMaxSteps, remainingAssistantOutput, runAssistantOutputLimit } from "./limits";
import type { AssistantModel } from "./model-config";
import { assistantPromptBody, assistantSystemPrompt } from "./provider-prompt";
import { assistantRunHistory } from "./run-history";
import { runAssistantStep } from "./run-step";
import { discoverAssistantTools } from "./tool-discovery";
import { processAssistantToolCalls } from "./tool-steps";
import { assistantTransaction } from "./transaction";
import { assistantMessageView, assistantRunView } from "./views";
import {
  ASSISTANT_ERROR_CODES,
  type AssistantErrorCode,
  type AssistantStreamEvent,
  FUNDING_MODES,
  type PageContext,
  type RunStatus,
} from "./wire";

export type UnsequencedAssistantEvent = {
  [K in AssistantStreamEvent["type"]]: Omit<Extract<AssistantStreamEvent, { type: K }>, "seq">;
}[AssistantStreamEvent["type"]];

export type EngineInput = {
  run: AssistantRun;
  assistantMessage: AssistantMessage;
  userMessage: AssistantMessage | null;
  project: { id: string; publicId: string; ownerId: string; name: string; domain: string | null };
  model: AssistantModel;
  principal: NativeSessionPrincipal;
  userText: string;
  context?: PageContext;
  retry: boolean;
  initialToolCall?: import("./wire").ToolCallView;
  signal: AbortSignal;
  timedOut: () => boolean;
  emit: (event: UnsequencedAssistantEvent) => void;
};
const callsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(200),
      name: z.string().min(1).max(100),
      argumentsJson: z.string().max(20000),
    }),
  )
  .max(8);

async function finish(
  input: EngineInput,
  status: RunStatus,
  error: AssistantErrorCode | null,
  text: string,
  partial: boolean,
  usageUnknown = false,
) {
  return assistantTransaction(async (tx) => {
    const current = await tx.assistantRun.findUniqueOrThrow({ where: { id: input.run.id } });
    // Only the stop endpoint marks the run cancelled; a dropped connection stays unknown.
    const explicitStop = current.status === "cancelled";
    const finalStatus =
      explicitStop && (status !== "unknown" || usageUnknown) ? "cancelled" : status;
    const finalError = finalStatus === "cancelled" ? "cancelled" : error;
    const generated =
      text.length > 0 || (await tx.assistantToolCall.count({ where: { runId: input.run.id } })) > 0;
    await tx.assistantMessage.update({
      where: { id: input.assistantMessage.id },
      data: {
        parts: text ? [{ type: "text", text }] : [],
        partial: generated && (partial || finalStatus === "cancelled"),
      },
    });
    const run = await tx.assistantRun.update({
      where: { id: input.run.id },
      data: {
        status: finalStatus,
        errorCode: finalError,
        finishedAt: finalStatus === "awaiting_approval" ? null : new Date(),
        ...(finalStatus === "unknown" || usageUnknown ? { costCertainty: "unknown" } : {}),
      },
    });
    if (finalStatus !== "awaiting_approval")
      await tx.assistantConversation.updateMany({
        where: {
          id: input.run.conversationId,
          userId: input.principal.userId,
          activeRunId: input.run.id,
        },
        data: { activeRunId: null },
      });
    return run;
  });
}

export async function executeAssistantRun(input: EngineInput) {
  const textParts = z
    .array(z.object({ type: z.literal("text"), text: z.string() }))
    .safeParse(input.assistantMessage.parts);
  let text = textParts.success ? textParts.data.map((part) => part.text).join("") : "";
  const started = assistantRunView(input.run);
  input.emit({
    type: "run.started",
    conversationId: input.run.conversationId,
    run: started,
    userMessage: input.userMessage ? assistantMessageView(input.userMessage, []) : null,
    assistantMessageId: input.assistantMessage.id,
  });
  if (input.initialToolCall)
    input.emit({
      type: "tool.updated",
      messageId: input.assistantMessage.id,
      call: input.initialToolCall,
    });
  let finalStatus: RunStatus = "failed",
    finalError: AssistantErrorCode | null = "limit_exceeded",
    partial = true,
    usageUnknown = false;
  try {
    await assistantProject(input.project.publicId, input.principal.userId);
    const loaded = await assistantRunHistory(
      input.run.conversationId,
      input.run.id,
      input.principal.userId,
      input.retry ? input.userText : undefined,
    );
    const funding = z.enum(FUNDING_MODES).parse(input.run.funding);
    const history = loaded.history,
      groups = loaded.groups;
    let callCount = loaded.callCount;
    const effort = runAssistantEffort(input.model, input.run.reasoningEffort);
    // The run's output cap bounds the whole turn: each step gets what earlier steps left of it,
    // which bounds that step's request, reservation and any stop estimate alike.
    const maxOutputTokens = runAssistantOutputLimit(input.model, input.run.maxOutputTokens);
    const deadline = Date.now() + 120000;
    for (let step = input.run.stepCount + 1; step <= assistantMaxSteps(); step++) {
      if (input.signal.aborted) {
        finalStatus = input.timedOut() ? "failed" : "cancelled";
        finalError = input.timedOut() ? "timeout" : "cancelled";
        break;
      }
      const access = await assistantProject(input.project.publicId, input.principal.userId);
      // A role lowered mid-run stops paid Credits use at the next step.
      if (funding === "credits" && !hasProjectCapability(access.role, "assistant.use")) {
        finalStatus = "failed";
        finalError = "credits_not_permitted";
        break;
      }
      const claimed = await prisma.assistantRun.updateMany({
        where: {
          id: input.run.id,
          userId: input.principal.userId,
          status: { in: ["pending", "streaming", "running_tool", "awaiting_approval"] },
        },
        data: { status: "streaming", stepCount: step },
      });
      if (claimed.count !== 1) {
        finalStatus = "cancelled";
        finalError = "cancelled";
        break;
      }
      const spent = await prisma.assistantRun.findUnique({
        where: { id: input.run.id },
        select: { outputTokens: true },
      });
      const model = {
        ...input.model,
        maxOutputTokens: remainingAssistantOutput(maxOutputTokens, spent?.outputTokens),
      };
      if (model.maxOutputTokens < 1) break; // failed with limit_exceeded, set above
      const tools = discoverAssistantTools(
        input.userText,
        input.context?.path ?? "",
        groups,
        access.readOnly,
      );
      const body = assistantPromptBody(
        model,
        assistantSystemPrompt(input.project, funding, input.context),
        history,
        tools,
      );
      // UTF-8 bytes bound byte-level BPE token counts from above; 500 covers framing tokens.
      const chars = Buffer.byteLength(JSON.stringify(body), "utf8") + 500;
      if (chars > model.contextChars) {
        finalStatus = "failed";
        finalError = "limit_exceeded";
        break;
      }
      const binding: AssistantAccountingBinding = {
        namespace: ASSISTANT_METERING_NAMESPACE,
        ownerId: input.project.ownerId,
        userId: input.principal.userId,
        projectId: input.project.id,
        runId: input.run.id,
        operationId: `assistant:${input.run.id}:${step}`,
        model,
        funding: funding,
        credentialId: input.run.credentialId ?? undefined,
        credentialVersion: input.run.credentialVersion ?? undefined,
        promptBytes: chars,
        effort,
      };
      const result = await runAssistantStep({
        binding,
        step,
        body,
        signal: input.signal,
        timeoutMs: Math.max(1, deadline - Date.now()),
        onText: (delta) => {
          if (text.length + delta.length > 50000) throw new Error("Assistant output too large");
          text += delta;
          input.emit({ type: "text.delta", messageId: input.assistantMessage.id, delta });
        },
      });
      await prisma.assistantMessage.update({
        where: { id: input.assistantMessage.id },
        data: { parts: text ? [{ type: "text", text }] : [], partial: false },
      });
      if (result.unknown) {
        usageUnknown = true;
        finalStatus = "unknown";
        finalError = result.error ?? "usage_unknown";
        break;
      }
      if (result.error || input.signal.aborted) {
        finalStatus = input.signal.aborted ? "cancelled" : "failed";
        finalError = input.timedOut() ? "timeout" : (result.error ?? "cancelled");
        break;
      }
      // Signed reasoning leads the assistant turn so the provider accepts its tool calls back.
      history.push(...result.reasoning);
      if (result.text) history.push({ type: "assistant", text: result.text });
      if (!result.calls.length) {
        finalStatus = "completed";
        finalError = null;
        partial = false;
        break;
      }
      const calls = callsSchema.safeParse(result.calls);
      if (
        !calls.success ||
        new Set(result.calls.map((call) => call.id)).size !== result.calls.length ||
        callCount + result.calls.length > 8
      ) {
        finalStatus = "failed";
        finalError = "limit_exceeded";
        break;
      }
      callCount += result.calls.length;
      const processed = await processAssistantToolCalls({
        calls: calls.data,
        runId: input.run.id,
        conversationId: input.run.conversationId,
        projectId: input.project.id,
        projectPublicId: input.project.publicId,
        principal: input.principal,
        readOnly: access.readOnly,
        signal: input.signal,
        turn: { step, reasoning: result.reasoning },
        onUpdate: (call) =>
          input.emit({ type: "tool.updated", messageId: input.assistantMessage.id, call }),
      });
      history.push(...processed.history);
      groups.push(...processed.groups);
      if (input.signal.aborted) {
        finalStatus = input.timedOut() ? "failed" : "cancelled";
        finalError = input.timedOut() ? "timeout" : "cancelled";
        break;
      }
      if (processed.waiting) {
        finalStatus = "awaiting_approval";
        finalError = null;
        partial = false;
        break;
      }
      if (Date.now() >= deadline) {
        finalStatus = "failed";
        finalError = "timeout";
        break;
      }
      finalError = "limit_exceeded";
    }
  } catch (error) {
    finalStatus = input.signal.aborted && !input.timedOut() ? "cancelled" : "failed";
    const code =
      error && typeof error === "object" && "code" in error
        ? z.enum(ASSISTANT_ERROR_CODES).safeParse(error.code)
        : null;
    finalError = input.timedOut()
      ? "timeout"
      : error instanceof AssistantRequestError
        ? error.code
        : code?.success
          ? code.data
          : "accounting_unavailable";
  }
  const run = await finish(input, finalStatus, finalError, text, partial, usageUnknown);
  if (finalError) input.emit({ type: "error", error: { code: finalError, message: finalError } });
  input.emit({ type: "run.finished", run: assistantRunView(run) });
}
