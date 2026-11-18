import type {
  AssistantMessage,
  AssistantRun,
  AssistantToolCall,
} from "@/lib/generated/prisma/client";
import { z } from "zod";
import { assistantResultLink } from "./tool-links";
import { findAssistantTool } from "./tool-policy";
import {
  ASSISTANT_ERROR_CODES,
  ASSISTANT_PROVIDERS,
  FUNDING_MODES,
  type MessageView,
  RUN_STATUSES,
  type RunView,
  TOOL_CALL_STATUSES,
  TOOL_CATEGORIES,
  type ToolCallView,
} from "./wire";

const textParts = z.array(
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string().max(50000) }),
    z.object({
      type: z.literal("notice"),
      code: z.enum(ASSISTANT_ERROR_CODES),
      message: z.string().max(500),
    }),
  ]),
);
const secret =
  /token|secret|password|authorization|(?:^|_)key(?:$|_)|(?:api|private|access|secret|client)key/i;

export function assistantRunView(
  run: AssistantRun,
  attempts: readonly { status: string }[] = [],
  chargedCents: string | null = null,
): RunView {
  const errorCode = z.enum(ASSISTANT_ERROR_CODES).safeParse(run.errorCode);
  const certainty = z
    .enum(["measured", "estimated", "unknown"])
    .catch("unknown")
    .parse(run.costCertainty);
  return {
    id: run.id,
    status: z.enum(RUN_STATUSES).parse(run.status),
    modelId: run.modelId,
    provider: z.enum(ASSISTANT_PROVIDERS).parse(run.provider),
    funding: z.enum(FUNDING_MODES).parse(run.funding),
    startedAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: errorCode.success ? { code: errorCode.data, message: errorCode.data } : null,
    usage: {
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      // With certainty unknown this is the settled subtotal, a lower bound on the run's cost.
      costMicroUsd: run.costMicroUsd?.toString() ?? null,
      certainty,
      chargedCents,
    },
    usageUncertain:
      run.status === "unknown" ||
      attempts.some((attempt) =>
        ["dispatched", "unknown", "pending_settlement"].includes(attempt.status),
      ),
  };
}
function previewValue(value: unknown): string | null {
  if (["string", "number", "boolean"].includes(typeof value)) return String(value).slice(0, 160);
  if (!Array.isArray(value)) return null;
  const items = value
    .slice(0, 5)
    .map((item) => {
      if (typeof item === "string") return item.slice(0, 60);
      if (item && typeof item === "object" && typeof item.keyword === "string")
        return item.keyword.slice(0, 60);
      return null;
    })
    .filter((item): item is string => item !== null);
  return items.length
    ? `${items.join(", ")}${value.length > items.length ? " ..." : ""}`.slice(0, 160)
    : null;
}
/** Scope, idempotency and cost-ceiling fields are shown elsewhere on the card or not at all. */
const STRUCTURAL_ARGS = new Set([
  "project_id",
  "idempotency_key",
  "async",
  "max_cost_cents",
  "cost_policy",
  "actual_cost_acknowledgement",
  "estimated_cost_limit_cents",
]);
const humanLabel = (key: string) => {
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
export function assistantToolCallView(call: AssistantToolCall): ToolCallView {
  const args =
    call.args && typeof call.args === "object" && !Array.isArray(call.args)
      ? Object.entries(call.args)
      : [];
  const argsPreview = args
    .filter(([key]) => !STRUCTURAL_ARGS.has(key) && !secret.test(key))
    .map(([key, value]) => ({ label: humanLabel(key), value: previewValue(value) }))
    .filter((item): item is { label: string; value: string } => item.value !== null)
    .slice(0, 6);
  const status = z.enum(TOOL_CALL_STATUSES).parse(call.status);
  const link =
    status === "completed" ? assistantResultLink(call.toolName, call.args, call.result) : null;
  const title = findAssistantTool(call.toolName)?.tool.title ?? call.toolName;
  return {
    id: call.id,
    toolName: call.toolName,
    title,
    category: z.enum(TOOL_CATEGORIES).parse(call.category),
    status,
    summary: status === "proposed" ? `${title} requires approval.` : `${title}: ${status}.`,
    target: null,
    argsPreview,
    maxCostCents: call.maxCostCents,
    estimatedCostCents: call.estimatedCostCents,
    toolFunding: null,
    expiresAt: call.expiresAt.toISOString(),
    argsHash: status === "proposed" ? call.argsHash : null,
    result:
      status === "completed"
        ? {
            summary: "Action completed.",
            link: link ? { href: link.href, label: link.label } : null,
            job:
              link?.kind === "run" ? { id: link.id, status: link.status, href: link.href } : null,
          }
        : null,
    error: null,
  };
}
export function assistantMessageView(
  message: AssistantMessage,
  calls: AssistantToolCall[],
): MessageView {
  const parsed = textParts.safeParse(message.parts);
  const parts: MessageView["parts"] = parsed.success ? parsed.data : [];
  if (message.role === "assistant" && message.runId)
    parts.push(
      ...calls
        .filter((call) => call.runId === message.runId)
        .map((call) => ({ type: "tool" as const, call: assistantToolCallView(call) })),
    );
  return {
    id: message.id,
    seq: message.seq,
    role: z.enum(["user", "assistant"]).parse(message.role),
    createdAt: message.createdAt.toISOString(),
    runId: message.runId,
    parts,
    partial: message.partial,
  };
}
