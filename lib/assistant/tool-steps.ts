import "server-only";
import type { NativeSessionPrincipal } from "@/lib/api/native-session";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import type { PromptItem } from "./provider-prompt";
import { proposeAssistantTool } from "./tool-approval";
import { assistantArgsHash, bindAssistantToolArgs } from "./tool-arguments";
import { ASSISTANT_TOOL_GROUPS, type AssistantToolGroup } from "./tool-discovery";
import { dispatchAssistantReadTool } from "./tool-dispatch";
import { estimateAssistantTool } from "./tool-estimate";
import { findAssistantTool } from "./tool-policy";
import { assistantTransaction } from "./transaction";
import { assistantToolCallView } from "./views";
import type { ToolCallView } from "./wire";

type Call = { id: string; name: string; argumentsJson: string };
const groupsSchema = z
  .object({ groups: z.array(z.enum(ASSISTANT_TOOL_GROUPS)).max(ASSISTANT_TOOL_GROUPS.length) })
  .strict();
export async function processAssistantToolCalls(input: {
  calls: Call[];
  runId: string;
  conversationId: string;
  projectId: string;
  projectPublicId: string;
  principal: NativeSessionPrincipal;
  /** A read-only role or project: write, paid and destructive tools are refused, never proposed. */
  readOnly: boolean;
  onUpdate: (call: ToolCallView) => void;
  signal?: AbortSignal;
  /** Model step and its signed reasoning, kept so a resumed run replays the same turn. */
  turn?: { step: number; reasoning: PromptItem[] };
}) {
  const history: PromptItem[] = [];
  const groups: AssistantToolGroup[] = [];
  let waiting = false;
  const record = async (
    call: Call,
    category: "read" | "excluded",
    status: "completed" | "blocked",
    args: Record<string, unknown>,
    result: Prisma.InputJsonObject,
  ) => {
    const row = await prisma.assistantToolCall.create({
      data: {
        runId: input.runId,
        conversationId: input.conversationId,
        projectId: input.projectId,
        userId: input.principal.userId,
        toolName: call.name.slice(0, 100),
        args: args as Prisma.InputJsonObject,
        argsHash: assistantArgsHash(args),
        category,
        status,
        result: { providerCallId: call.id, ...result },
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    input.onUpdate(assistantToolCallView(row));
  };
  for (const call of input.calls) {
    if (input.signal?.aborted) break;
    let parsed: unknown;
    try {
      parsed = JSON.parse(call.argumentsJson);
    } catch {
      parsed = null;
    }
    history.push({
      type: "tool_call",
      id: call.id,
      name: call.name,
      argumentsJson: call.argumentsJson,
    });
    if (call.name === "select_tool_groups") {
      const selection = groupsSchema.safeParse(parsed);
      if (selection.success) groups.push(...selection.data.groups);
      const result = selection.success
        ? { selected: selection.data.groups }
        : { error: "invalid groups" };
      await record(
        call,
        "read",
        selection.success ? "completed" : "blocked",
        bindAssistantToolArgs(selection.success ? selection.data : {}, input.projectPublicId),
        result,
      );
      history.push({
        type: "tool_result",
        id: call.id,
        result: selection.success
          ? { selected: selection.data.groups }
          : { error: "invalid groups" },
      });
      continue;
    }
    const policy = findAssistantTool(call.name);
    if (
      !policy ||
      policy.category === "excluded" ||
      (input.readOnly && policy.category !== "read")
    ) {
      await record(call, "excluded", "blocked", bindAssistantToolArgs({}, input.projectPublicId), {
        error: "tool unavailable",
      });
      history.push({ type: "tool_result", id: call.id, result: { error: "tool unavailable" } });
      continue;
    }
    let args: Record<string, unknown>;
    try {
      args = bindAssistantToolArgs(parsed, input.projectPublicId);
    } catch {
      await record(call, "excluded", "blocked", bindAssistantToolArgs({}, input.projectPublicId), {
        error: "invalid arguments",
      });
      history.push({ type: "tool_result", id: call.id, result: { error: "invalid arguments" } });
      continue;
    }
    if (policy.category !== "read") {
      const estimatedCostCents =
        policy.category === "paid"
          ? await estimateAssistantTool(
              call.name,
              args,
              input.principal,
              input.projectPublicId,
              call.id,
            )
          : null;
      const proposal = await assistantTransaction((tx) =>
        proposeAssistantTool(tx, {
          runId: input.runId,
          userId: input.principal.userId,
          toolName: call.name,
          args,
          providerCallId: call.id,
          estimatedCostCents,
        }),
      );
      waiting = true;
      input.onUpdate(assistantToolCallView(proposal));
      continue;
    }
    const row = await prisma.assistantToolCall.create({
      data: {
        runId: input.runId,
        conversationId: input.conversationId,
        projectId: input.projectId,
        userId: input.principal.userId,
        toolName: call.name,
        args: args as Prisma.InputJsonObject,
        argsHash: assistantArgsHash(args),
        category: "read",
        status: "running",
        result: { providerCallId: call.id },
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    input.onUpdate(assistantToolCallView(row));
    try {
      const result = await dispatchAssistantReadTool(
        call.name,
        args,
        input.principal,
        input.projectPublicId,
        row.id,
      );
      const updated = await prisma.assistantToolCall.update({
        where: { id: row.id },
        data: {
          status: result.ok ? "completed" : "failed",
          result: {
            providerCallId: call.id,
            ok: result.ok,
            status: result.status,
            payload: result.payload,
          } as Prisma.InputJsonObject,
        },
      });
      input.onUpdate(assistantToolCallView(updated));
      history.push({ type: "tool_result", id: call.id, result: result.payload });
    } catch {
      const updated = await prisma.assistantToolCall.update({
        where: { id: row.id },
        data: { status: "failed", result: { providerCallId: call.id, error: "tool unavailable" } },
      });
      input.onUpdate(assistantToolCallView(updated));
      history.push({ type: "tool_result", id: call.id, result: { error: "tool unavailable" } });
    }
  }
  if (input.turn) await recordAssistantTurn(input.runId, input.calls, input.turn);
  // One assistant turn carries every call of the step; their results follow together.
  const ordered = [
    ...history.filter((item) => item.type === "tool_call"),
    ...history.filter((item) => item.type !== "tool_call"),
  ];
  return { history: ordered, groups, waiting };
}

async function recordAssistantTurn(
  runId: string,
  calls: Call[],
  turn: { step: number; reasoning: PromptItem[] },
) {
  const byCall = (id: string) => ({ result: { path: ["providerCallId"], equals: id } });
  if (!calls.length) return;
  await prisma.assistantToolCall.updateMany({
    where: { runId, OR: calls.map((call) => byCall(call.id)) },
    data: { step: turn.step },
  });
  if (turn.reasoning.length)
    await prisma.assistantToolCall.updateMany({
      where: { runId, ...byCall(calls[0]?.id ?? "") },
      data: { providerReasoning: turn.reasoning as Prisma.InputJsonArray },
    });
}
