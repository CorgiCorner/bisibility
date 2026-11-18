import "server-only";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { getAssistantConversation } from "./conversations";
import type { PromptItem } from "./provider-prompt";
import type { AssistantToolGroup } from "./tool-discovery";
import { ASSISTANT_TOOL_GROUPS } from "./tool-discovery";

const reasoningSchema = z
  .array(
    z.object({
      type: z.literal("reasoning"),
      text: z.string(),
      providerOptions: z.object({
        anthropic: z.union([
          z.object({ signature: z.string() }).strict(),
          z.object({ redactedData: z.string() }).strict(),
        ]),
      }),
    }),
  )
  .max(64);

/** Reload checks current membership before any stored text or tool result enters a prompt. */
export async function assistantRunHistory(
  conversationId: string,
  runId: string,
  userId: string,
  retryText?: string,
) {
  const conversation = await getAssistantConversation(conversationId, userId);
  const history: PromptItem[] = [];
  if (retryText) history.push({ type: "user", text: retryText });
  else
    for (const message of conversation.messages.slice(-40)) {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .slice(0, 12000);
      if (text) history.push({ type: message.role, text });
    }
  const groups: AssistantToolGroup[] = [];
  const calls = await prisma.assistantToolCall.findMany({
    where: { runId, userId },
    orderBy: { createdAt: "asc" },
  });
  // Calls of one model step replay as one assistant turn, led by that step's signed reasoning.
  let turn: { step: number | null; results: PromptItem[] } = { step: null, results: [] };
  const close = () => history.push(...turn.results.splice(0));
  for (const call of calls) {
    if (["proposed", "approved", "running", "unknown"].includes(call.status))
      throw new Error("Assistant tool approval remains pending");
    if (
      !call.result ||
      typeof call.result !== "object" ||
      Array.isArray(call.result) ||
      typeof call.result.providerCallId !== "string"
    )
      continue;
    const id = call.result.providerCallId;
    if (call.step === null || call.step !== turn.step) {
      close();
      turn = { step: call.step, results: [] };
      const reasoning = reasoningSchema.safeParse(call.providerReasoning);
      if (reasoning.success) history.push(...reasoning.data);
    }
    history.push({
      type: "tool_call",
      id,
      name: call.toolName,
      argumentsJson: JSON.stringify(call.args),
    });
    const result =
      call.status === "denied"
        ? { denied: true }
        : call.status === "blocked"
          ? { error: "tool not executed" }
          : (call.result.payload ?? call.result);
    turn.results.push({ type: "tool_result", id, result });
    if (call.toolName === "select_tool_groups" && Array.isArray(call.result.selected)) {
      for (const group of call.result.selected)
        if (typeof group === "string" && ASSISTANT_TOOL_GROUPS.some((item) => item === group))
          groups.push(group as AssistantToolGroup);
    }
  }
  close();
  return { history, groups, callCount: calls.length };
}
