import { z } from "zod";
import { ASSISTANT_EFFORTS, type AssistantEffort } from "./effort";

/**
 * Browser <-> server contract for the in-dashboard assistant. The server transcript is
 * authoritative: the client may only submit a new user turn, a stop request or a bound
 * approval decision. Every identifier here is a server-issued opaque string.
 */

export const ASSISTANT_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;
export type AssistantProvider = (typeof ASSISTANT_PROVIDERS)[number];

export const FUNDING_MODES = ["credits", "byok"] as const;
export type FundingMode = (typeof FUNDING_MODES)[number];

export const RUN_STATUSES = [
  "pending",
  "streaming",
  "awaiting_approval",
  "running_tool",
  "completed",
  "cancelled",
  "failed",
  "unknown",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ["pending", "streaming", "running_tool"];

export const TOOL_CATEGORIES = ["read", "paid", "mutation", "destructive", "excluded"] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const TOOL_CALL_STATUSES = [
  "proposed",
  "approved",
  "running",
  "completed",
  "failed",
  "denied",
  "expired",
  "blocked",
  "unknown",
] as const;
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];
/** Distinct, user-explainable states. The UI maps each code to its own copy. */
export const ASSISTANT_ERROR_CODES = [
  "not_configured",
  "model_unavailable",
  "pricing_unavailable",
  "credits_unavailable",
  "credits_insufficient",
  "credits_paused",
  "credits_not_permitted",
  "assistant_paused",
  "team_daily_limit",
  "team_concurrency_limit",
  "pool_exhausted",
  "limit_exceeded",
  "byok_missing",
  "byok_invalid",
  "seo_credits_insufficient",
  "provider_rate_limited",
  "provider_unavailable",
  "project_read_only",
  "permission_denied",
  "timeout",
  "usage_unknown",
  "conversation_busy",
  "duplicate_request",
  "approval_expired",
  "approval_conflict",
  "accounting_unavailable",
  "invalid_request",
  "cancelled",
  "internal",
] as const;
export type AssistantErrorCode = (typeof ASSISTANT_ERROR_CODES)[number];

export const assistantErrorSchema = z.object({
  code: z.enum(ASSISTANT_ERROR_CODES),
  message: z.string().max(500),
});
export type AssistantErrorView = z.infer<typeof assistantErrorSchema>;

const opaqueId = z.string().min(1).max(64);
const projectRef = z.string().regex(/^prj_[A-Za-z0-9]{1,40}$/);

export const fundingChoiceSchema = z.object({
  mode: z.enum(FUNDING_MODES),
  provider: z.enum(ASSISTANT_PROVIDERS),
});
export type FundingChoice = z.infer<typeof fundingChoiceSchema>;

export const pageContextSchema = z
  .object({
    path: z.string().max(300),
    title: z.string().max(200).optional(),
    selection: z.string().max(2000).optional(),
  })
  .strict();
export type PageContext = z.infer<typeof pageContextSchema>;
export const MAX_USER_TEXT_CHARS = 8000;

export const turnRequestSchema = z
  .object({
    project: projectRef,
    conversationId: opaqueId.nullable(),
    /** Client-generated per submit; a resubmit with the same id never starts a second run. */
    requestId: z.string().uuid(),
    text: z.string().trim().min(1).max(MAX_USER_TEXT_CHARS).optional(),
    /** Regenerate the answer to the last user message of a failed/cancelled run. Never replays tools. */
    retryOfRunId: opaqueId.optional(),
    modelId: z.string().min(1).max(100),
    effort: z.enum(ASSISTANT_EFFORTS).optional(),
    maxOutputTokens: z.number().int().positive().max(10_000_000).optional(),
    context: pageContextSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.text) !== Boolean(value.retryOfRunId), {
    message: "Provide exactly one of text or retryOfRunId.",
  });
export type TurnRequest = z.infer<typeof turnRequestSchema>;

export const fundingPreferenceRequestSchema = z
  .object({
    project: projectRef,
    provider: z.enum(ASSISTANT_PROVIDERS),
    mode: z.enum(FUNDING_MODES),
  })
  .strict();

export const toolDecisionSchema = z
  .object({
    decision: z.enum(["approve", "deny"]),
    /** Must equal the hash the server showed; any argument change invalidates the approval. */
    argsHash: z.string().regex(/^[a-f0-9]{64}$/),
    /** Must equal the ceiling the server showed; a raised ceiling invalidates the approval. */
    maxCostCents: z.number().int().nonnegative().nullable(),
    requestId: z.string().uuid(),
  })
  .strict();
export type ToolDecision = z.infer<typeof toolDecisionSchema>;

export const byokCredentialRequestSchema = z
  .object({
    provider: z.enum(ASSISTANT_PROVIDERS),
    apiKey: z.string().trim().min(20).max(400),
  })
  .strict();

export type ModelView = {
  id: string;
  provider: AssistantProvider;
  label: string;
  /** Models without tool use are never offered for project actions. */
  toolUse: boolean;
  efforts: AssistantEffort[];
  defaultEffort: AssistantEffort | null;
  /** Catalog output cap; per-turn caps above it are rejected. */
  maxOutputTokens: number;
};

/** Credits used, the optional monthly cap and open holds admission counts, in exact cents. */
export type CreditUsageView = { usedCents: string; limitCents: string | null; heldCents?: string };

export type FundingOptionView = {
  mode: FundingMode;
  provider: AssistantProvider;
  available: boolean;
  /** Present when unavailable: the precise reason, never a generic failure. */
  reason: AssistantErrorCode | null;
  /** Credits only: month-to-date usage against the project AI limit. */
  usage: CreditUsageView | null;
  /** BYOK only: masked connection identity. The secret never leaves the server. */
  credential: { id: string; last4: string; status: "active" | "invalid" } | null;
};

export type StarterView = { id: string; label: string; prompt: string };

export type AssistantConfigView = {
  enabled: boolean;
  reason: AssistantErrorCode | null;
  project: { publicId: string; name: string; role: string; readOnly: boolean };
  models: ModelView[];
  funding: FundingOptionView[];
  /** Stored choices. A missing provider still uses the default rule for that provider. */
  fundingPreference: { provider: AssistantProvider; mode: FundingMode }[];
  creditsEnabled: boolean;
  defaults: { modelId: string | null; funding: FundingChoice | null };
  starters: StarterView[];
  limits: { maxUserTextChars: number; maxSteps: number };
};

export type ToolCallView = {
  id: string;
  toolName: string;
  /** Human title from the canonical tool metadata. */
  title: string;
  category: ToolCategory;
  status: ToolCallStatus;
  /** One sentence: what will be / was done. Never raw JSON. */
  summary: string;
  /** Human target, for example the project or keyword it affects. */
  target: string | null;
  /** Bounded, display-safe argument preview. */
  argsPreview: { label: string; value: string }[];
  maxCostCents: number | null;
  estimatedCostCents: number | null;
  /** Funding of the tool's own SEO cost, separate from AI funding. */
  toolFunding: string | null;
  expiresAt: string | null;
  /** Only while status is proposed; echoed back in the decision. */
  argsHash: string | null;
  result: {
    summary: string;
    link: { href: string; label: string } | null;
    job: { id: string; status: string; href: string | null } | null;
  } | null;
  error: AssistantErrorView | null;
};

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; call: ToolCallView }
  | { type: "notice"; code: AssistantErrorCode; message: string };

export type MessageView = {
  id: string;
  seq: number;
  role: "user" | "assistant";
  createdAt: string;
  runId: string | null;
  parts: MessagePart[];
  /** True when text was cut by Stop, timeout or an error. */
  partial: boolean;
};

export type RunUsageView = {
  inputTokens: number;
  outputTokens: number;
  /** Settled AI cost in micro-USD. With certainty unknown, the settled lower bound. */
  costMicroUsd: string | null;
  certainty: "measured" | "estimated" | "unknown";
  /** Customer cents a Credits run was charged, corrections included; null for your key. */
  chargedCents: string | null;
};

export type RunView = {
  id: string;
  status: RunStatus;
  modelId: string;
  provider: AssistantProvider;
  funding: FundingMode;
  startedAt: string;
  finishedAt: string | null;
  error: AssistantErrorView | null;
  usage: RunUsageView | null;
  /** A dispatched attempt has no settled receipt, or the run itself is unknown. */
  usageUncertain: boolean;
};

export type ConversationSummaryView = {
  id: string;
  title: string;
  updatedAt: string;
  status: RunStatus | null;
  pendingApprovals: number;
};

export type ConversationView = {
  id: string;
  projectPublicId: string;
  title: string;
  messages: MessageView[];
  runs: RunView[];
  activeRunId: string | null;
};

export type AssistantStreamEvent =
  | {
      seq: number;
      type: "run.started";
      conversationId: string;
      run: RunView;
      userMessage: MessageView | null;
      assistantMessageId: string;
    }
  | { seq: number; type: "text.delta"; messageId: string; delta: string }
  | { seq: number; type: "tool.updated"; messageId: string; call: ToolCallView }
  | { seq: number; type: "run.updated"; run: RunView }
  | { seq: number; type: "error"; error: AssistantErrorView }
  | { seq: number; type: "run.finished"; run: RunView };

/** NDJSON framing: one JSON event per line. */
export const ASSISTANT_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export const ASSISTANT_API = {
  config: "/api/assistant/config",
  conversations: "/api/assistant/conversations",
  conversation: (id: string) => `/api/assistant/conversations/${encodeURIComponent(id)}`,
  turns: "/api/assistant/turns",
  stop: (runId: string) => `/api/assistant/runs/${encodeURIComponent(runId)}/stop`,
  decision: (toolCallId: string) =>
    `/api/assistant/tool-calls/${encodeURIComponent(toolCallId)}/decision`,
  credentials: "/api/assistant/credentials",
  funding: "/api/assistant/funding",
  credential: (id: string) => `/api/assistant/credentials/${encodeURIComponent(id)}`,
} as const;
