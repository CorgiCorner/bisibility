import type { SamplePlan } from "@/lib/ai-tracking/contract";
import type { TrackingEnvelope } from "@/lib/ai-tracking/providers/envelope";

export function samplePlan(overrides: Partial<SamplePlan> = {}): SamplePlan {
  return {
    version: 1,
    projectId: "project",
    actorId: "user",
    runId: "run",
    sampleId: "sample",
    promptRevisionId: "revision",
    promptCategory: "neutral",
    promptText: "Which products help?",
    promptHash: "hash",
    provider: "dataforseo",
    endpoint: "ai_optimization/chat_gpt/llm_responses/task_post",
    engine: "chat_gpt",
    source: "model_api",
    requestedParameters: { max_output_tokens: 512, web_search: false },
    requestedModel: "gpt-4.1-mini",
    requestHash: "request-hash",
    credentialConnectionId: "connection",
    credentialVersion: "credential-version",
    budgetRevision: "budget",
    consentRevision: "consent",
    origin: "manual",
    entrySource: "app",
    attemptId: "attempt",
    deadline: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

export function submittedEnvelope(plan: SamplePlan): TrackingEnvelope {
  return {
    status_code: 20000,
    tasks: [{ status_code: 20100, id: `task-${plan.attemptId}`, cost: 0.0102 }],
  };
}
