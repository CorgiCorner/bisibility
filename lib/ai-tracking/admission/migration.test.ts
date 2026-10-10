import type { PlanTrackingRunInput, SamplePlan } from "@/lib/ai-tracking/contract";
import { samplePlan } from "@/lib/ai-tracking/execution/fixture";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  project: { id: "project", writeMode: "active", budgetCapCents: 1000 },
  transport: vi.fn(),
  planned: vi.fn(),
  access: vi.fn(),
  db: {
    project: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    aiPrompt: { findMany: vi.fn() },
    aiPromptRevision: { findFirst: vi.fn() },
    aiTrackingRun: { findFirst: vi.fn(), upsert: vi.fn() },
    aiTrackingSchedule: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: state.db }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/operations/access-extension", () => ({ assertOperationAccess: state.access }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({ login: "fixture@example.com", password: "test-password" }),
}));
vi.mock("@/lib/provider-usage/credential-version", () => ({
  ownCredentialVersion: () => "credential-version",
}));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({ preflightProviderBudget: vi.fn() }));
vi.mock("@/lib/ai-tracking/admission/pricing", () => ({
  TRACKING_PRICE_CHECKED_AT: "fixture",
  trackingModelForecast: async () => 1,
}));
vi.mock("@/lib/ai-tracking/providers/capabilities", () => ({
  TRACKING_CAPABILITY_VERSION: "fixture",
  validateTrackingRequest: vi.fn(),
  freshModelCapabilities: vi.fn(),
  trackingPayload: (plan: SamplePlan) => ({ prompt: plan.promptText }),
  retrievalEndpoint: (_plan: SamplePlan, taskId: string) => `purchased/${taskId}`,
}));
vi.mock("@/lib/ai-tracking/providers/transport", () => ({ trackingTransport: state.transport }));
vi.mock("@/lib/ai-tracking/stores/runs", () => ({ planTrackingRun: state.planned }));
vi.mock("@/lib/provider-usage/tag", () => ({
  createProviderRequestAttribution: async () => ({ tag: "fixture" }),
}));
vi.mock("@/lib/provider-usage/request-journal", () => ({
  createProviderRequestJournal: () => ({ observer: {} }),
}));

import { trackingExecutionPorts } from "@/lib/ai-tracking/execution/runtime";
import { planDueTrackingSchedules } from "@/lib/ai-tracking/scheduling/sweep";
import { previewTrackingRun } from "./launch";

const now = new Date("2026-10-08T12:00:00Z");
let input: PlanTrackingRunInput & { consent: boolean };
let plan: SamplePlan;

beforeEach(async () => {
  vi.resetAllMocks();
  state.project.writeMode = "active";
  state.db.project.findUnique.mockImplementation(async () => ({ ...state.project }));
  state.db.providerConnection.findFirst.mockResolvedValue({
    id: "connection",
    publicId: "connection-public",
    provider: "dataforseo",
    credentialsEncrypted: "fixture-ciphertext",
    allocationAmountPerMonth: 1000,
    programmaticAllocationAmountPerMonth: 1000,
  });
  state.db.user.findUnique.mockResolvedValue({
    id: "user",
    deactivatedAt: null,
    memberships: [{ projectId: "project", role: "admin" }],
  });
  state.db.aiPrompt.findMany.mockResolvedValue([
    {
      id: "prompt",
      revisions: [{ id: "revision", text: "Which products help?", textHash: "hash" }],
    },
  ]);
  state.db.aiPromptRevision.findFirst.mockResolvedValue({ textHash: "hash" });
  const configuration = {
    provider: "dataforseo" as const,
    endpoint: "ai_optimization/chat_gpt/llm_responses/task_post",
    engine: "chat_gpt" as const,
    source: "model_api" as const,
    model: "gpt-4.1-mini",
    parameters: { max_output_tokens: 512 },
  };
  const preview = await previewTrackingRun("project", {
    promptIds: ["prompt"],
    configurations: [configuration],
    credentialConnectionId: "connection",
  });
  input = {
    ...preview,
    promptIds: ["prompt"],
    actorId: "user",
    origin: "scheduled",
    entrySource: "worker",
    idempotencyKey: "fixture-occurrence",
    deadline: new Date(Date.now() + 3600_000).toISOString(),
    consent: true,
  };
  plan = samplePlan({
    budgetRevision: preview.budgetRevision,
    consentRevision: preview.consentRevision,
    origin: "scheduled",
    entrySource: "worker",
  });
  state.db.aiTrackingRun.findFirst.mockImplementation(async () => ({
    state: "planned",
    scheduleId: "schedule",
    launchPayload: input,
    samples: [{ plan }],
  }));
  state.db.aiTrackingSchedule.findFirst.mockImplementation(async () => ({ configuration: input }));
  state.db.aiTrackingSchedule.findMany.mockImplementation(async () => [
    {
      id: "schedule",
      projectId: "project",
      cron: "0 12 * * *",
      timezone: "UTC",
      nextRunAt: now,
      configuration: input,
    },
  ]);
  state.db.aiTrackingSchedule.updateMany.mockResolvedValue({ count: 1 });
  state.db.aiTrackingRun.upsert.mockResolvedValue({ id: "blocked-run" });
  state.planned.mockResolvedValue({ id: "run" });
  state.transport.mockResolvedValue({ tasks: [] });
});

it("plans a due schedule while its project accepts writes", async () => {
  expect(await planDueTrackingSchedules(now)).toEqual({ planned: 1, skipped: 0 });
  expect(state.planned).toHaveBeenCalledTimes(1);
});

it.each(["migration_hold", "migrated"])("blocks due schedules for a %s project", async (mode) => {
  state.project.writeMode = mode;
  expect(await planDueTrackingSchedules(now)).toEqual({ planned: 0, skipped: 0 });
  expect(state.planned).not.toHaveBeenCalled();
  expect(state.db.aiTrackingRun.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ create: expect.objectContaining({ state: "blocked" }) }),
  );
});

it.each(["migration_hold", "migrated"])(
  "blocks a new provider POST when a project becomes %s after preparation",
  async (mode) => {
    const prepared = await trackingExecutionPorts.prepare(plan);
    state.project.writeMode = mode;
    await expect(prepared.submit()).rejects.toThrow(/read-only mode/);
    expect(state.transport).not.toHaveBeenCalled();
  },
);

it.each(["migration_hold", "migrated"])(
  "still collects the original purchased task for a %s project",
  async (mode) => {
    state.project.writeMode = mode;
    state.access.mockClear();
    await trackingExecutionPorts.collect(plan, "original-task");
    expect(state.transport).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "purchased/original-task" }),
    );
    expect(state.transport.mock.calls[0][0]).not.toHaveProperty("payload");
    expect(state.access).not.toHaveBeenCalled();
  },
);
