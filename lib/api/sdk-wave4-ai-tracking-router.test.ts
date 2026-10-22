import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  scope: vi.fn(),
  topics: vi.fn(),
  prompts: vi.fn(),
  schedules: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  archiveTopic: vi.fn(),
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  archivePrompt: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  archiveSchedule: vi.fn(),
  run: vi.fn(),
  cancel: vi.fn(),
  launch: vi.fn(),
  approve: vi.fn(),
  runs: vi.fn(),
  connection: vi.fn(),
  context: vi.fn(),
  competitors: vi.fn(),
}));
vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.auth,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
}));
vi.mock("./idempotency", () => ({ withIdempotency: vi.fn((_ctx, execute) => execute()) }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn(), writeAuditFailure: vi.fn() }));
vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: mocks.scope }));
vi.mock("@/lib/ai-tracking/stores/topics", () => ({
  listTopics: mocks.topics,
  createTopic: mocks.createTopic,
  updateTopic: mocks.updateTopic,
  archiveTopic: mocks.archiveTopic,
}));
vi.mock("@/lib/ai-tracking/stores/prompts", () => ({
  listPrompts: mocks.prompts,
  createPrompt: mocks.createPrompt,
  updatePrompt: mocks.updatePrompt,
  archivePrompt: mocks.archivePrompt,
  listPromptRevisions: vi.fn(),
}));
vi.mock("@/lib/ai-tracking/stores/schedules", () => ({
  listSchedules: mocks.schedules,
  createSchedule: mocks.createSchedule,
  updateSchedule: mocks.updateSchedule,
  archiveSchedule: mocks.archiveSchedule,
}));
vi.mock("@/lib/ai-tracking/stores/runs", () => ({
  getTrackingRun: mocks.run,
  cancelTrackingRun: mocks.cancel,
}));
vi.mock("@/lib/ai-tracking/queries/runs", () => ({ listTrackingRuns: mocks.runs }));
vi.mock("@/lib/ai-tracking/queries/connections", () => ({
  resolveTrackingConnection: mocks.connection,
}));
vi.mock("@/lib/ai-tracking/admission/launch", () => ({
  launchTrackingRun: mocks.launch,
  approveTrackingConfiguration: mocks.approve,
}));
vi.mock("@/lib/project-context/service", () => ({ getProjectContext: mocks.context }));
vi.mock("@/lib/queries/competitors", () => ({ getCompetitorsApiViewFor: mocks.competitors }));

import { handleApiRequest } from "./router";

const projectId = "prj_a00000000000000000000000";
const topicId = "ait_a00000000000000000000000";
const promptId = "aip_a00000000000000000000000";
const scheduleId = "ais_a00000000000000000000000";
const runId = "air_a00000000000000000000000";
const connectionId = "conn_a00000000000000000000000";
const now = new Date("2026-10-20T00:00:00.000Z");
const dates = { createdAt: now, updatedAt: now, archivedAt: null, pausedAt: null };
const topic = {
  id: "topic-db",
  publicId: topicId,
  name: "Example topic",
  description: null,
  ...dates,
};
const prompt = {
  id: "prompt-db",
  publicId: promptId,
  topicId: topic.id,
  label: null,
  ...dates,
  revisions: [
    {
      id: "revision-db",
      publicId: "apr_a00000000000000000000000",
      ordinal: 1,
      category: "neutral",
      text: "What does example.com offer?",
      textHash: "a".repeat(64),
      createdAt: now,
      provenance: null,
    },
  ],
};
const configuration = {
  provider: "dataforseo",
  endpoint: "ai_optimization/llm_responses/live",
  engine: "chat_gpt",
  source: "model_api",
  model: null,
  parameters: { language_code: "en" },
};
const plan = {
  prompt_ids: [promptId],
  configurations: [configuration],
  credential_connection_id: connectionId,
  credential_version: "v1",
  budget_revision: "b1",
  consent_revision: "c1",
  deadline: now.toISOString(),
};
const schedule = {
  id: "schedule-db",
  publicId: scheduleId,
  name: "Example schedule",
  cron: "0 0 * * *",
  timezone: "UTC",
  enabled: false,
  nextRunAt: null,
  ...dates,
  configuration: { configurations: [configuration], promptIds: [prompt.id] },
};
const run = {
  id: "run-db",
  publicId: runId,
  state: "planned",
  ...dates,
  finishedAt: null,
  plannedAt: null,
  samples: [],
};

async function call(method: string, suffix: string, body?: unknown, idempotency = true) {
  const url = new URL(`https://example.com/api/v1/projects/${projectId}/ai-tracking/${suffix}`);
  return handleApiRequest(
    new Request(url, {
      method,
      headers: {
        authorization: "Bearer bsb_key_live_test",
        "Content-Type": "application/json",
        ...(idempotency ? { "Idempotency-Key": "example-mutation" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    url.pathname.slice("/api/v1/".length).split("/"),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  const project = {
    id: "project-db",
    publicId: projectId,
    name: "Example",
    domain: "example.com",
    ownerId: "owner",
    writeMode: "writable",
    ...dates,
  };
  mocks.auth.mockResolvedValue({
    kind: "project_key",
    apiKey: { id: "key-db", projectId: project.id, scopes: ["read", "write", "admin"] },
    project,
  });
  mocks.scope.mockResolvedValue(project);
  mocks.topics.mockResolvedValue([topic]);
  mocks.prompts.mockResolvedValue([prompt]);
  mocks.schedules.mockResolvedValue([schedule]);
  for (const [create, update, archive, row] of [
    [mocks.createTopic, mocks.updateTopic, mocks.archiveTopic, topic],
    [mocks.createPrompt, mocks.updatePrompt, mocks.archivePrompt, prompt],
    [mocks.createSchedule, mocks.updateSchedule, mocks.archiveSchedule, schedule],
  ] as const) {
    create.mockResolvedValue(row);
    update.mockResolvedValue(row);
    archive.mockResolvedValue({ ...row, archivedAt: now });
  }
  mocks.run.mockResolvedValue(run);
  mocks.cancel.mockResolvedValue({ ...run, state: "cancelled", finishedAt: now });
  mocks.launch.mockResolvedValue({ ...run, publicId: "air_b00000000000000000000000" });
  mocks.approve.mockResolvedValue({ paymentConsent: undefined });
  mocks.runs.mockResolvedValue({ items: [run], nextCursor: "next-page" });
  mocks.connection.mockResolvedValue({ id: "connection-db", publicId: connectionId });
  mocks.context.mockResolvedValue({
    business: "Example services",
    audience: "Teams",
    products: "Example tools",
    goals: "Find customers",
    agentRules: "",
    updatedAt: now.toISOString(),
  });
  mocks.competitors.mockResolvedValue({
    managedCompetitors: [
      { id: "cmp_a00000000000000000000000", label: "Example competitor", domain: "example.com" },
    ],
  });
});

describe("SDK wave 4 AI tracking through the real router and projections", () => {
  it("creates, updates, archives and pages topics", async () => {
    for (const [method, path, body, status] of [
      ["POST", "topics", { name: "Example topic" }, 201],
      ["PATCH", `topics/${topicId}`, { description: null, paused: true }, 200],
      ["DELETE", `topics/${topicId}`, undefined, 200],
      ["GET", "topics?limit=1", undefined, 200],
    ] as const)
      expect((await call(method, path, body)).status).toBe(status);
    expect(mocks.updateTopic).toHaveBeenCalledWith("project-db", topic.id, {
      description: null,
      paused: true,
    });
  });
  it("creates, revises and archives prompts with real revision records", async () => {
    const created = await call("POST", "prompts", {
      text: prompt.revisions[0].text,
      topic_id: topicId,
    });
    expect(created.status).toBe(201);
    expect((await created.json()).data).toMatchObject({
      topic_id: topicId,
      revisions: [{ category: "neutral" }],
    });
    mocks.updatePrompt.mockResolvedValue({
      ...prompt,
      revisions: [
        {
          ...prompt.revisions[0],
          provenance: {
            method: "model_generated_hypothesis",
            generationId: "asg_a00000000000000000000000",
            draftId: "00000000-0000-4000-8000-000000000001",
          },
        },
      ],
    });
    expect((await call("PATCH", `prompts/${promptId}`, { label: "Example" })).status).toBe(200);
    mocks.archivePrompt.mockResolvedValue({
      ...prompt,
      archivedAt: now,
      revisions: [
        {
          ...prompt.revisions[0],
          provenance: {
            method: "provider_dataset",
            reportId: "agr_a00000000000000000000000",
            rowIndex: 0,
          },
        },
      ],
    });
    expect((await call("DELETE", `prompts/${promptId}`)).status).toBe(200);
    expect(mocks.createPrompt).toHaveBeenCalledWith(
      "project-db",
      expect.objectContaining({ topicId: topic.id }),
    );
  });
  it("creates, updates, archives and pages schedule templates", async () => {
    expect(
      (
        await call("POST", "schedules", {
          name: schedule.name,
          cron: schedule.cron,
          timezone: "UTC",
          configuration: plan,
          consent: true,
        })
      ).status,
    ).toBe(201);
    expect(mocks.createSchedule).toHaveBeenCalledWith(
      "project-db",
      expect.objectContaining({
        configuration: expect.objectContaining({
          promptIds: [prompt.id],
          credentialConnectionId: "connection-db",
        }),
      }),
    );
    expect((await call("PATCH", `schedules/${scheduleId}`, { next_run_at: null })).status).toBe(
      200,
    );
    expect(
      (
        await call("PATCH", `schedules/${scheduleId}`, {
          configuration: plan,
          enabled: true,
          consent: true,
        })
      ).status,
    ).toBe(200);
    expect(mocks.approve).toHaveBeenCalledWith(
      "project-db",
      expect.objectContaining({ consent: true }),
    );
    expect((await call("DELETE", `schedules/${scheduleId}`)).status).toBe(200);
    const listed = await call("GET", "schedules?limit=1");
    expect(listed.status).toBe(200);
    expect((await listed.json()).data[0].configuration.prompt_ids).toEqual([promptId]);
  });
  it("pages runs, cancels without body fields and retries with fresh revisions", async () => {
    expect((await call("GET", "runs?limit=1")).status).toBe(200);
    expect((await call("POST", `runs/${runId}/cancel`)).status).toBe(200);
    expect((await call("POST", `runs/${runId}/retry`, { ...plan, consent: true })).status).toBe(
      200,
    );
    expect(mocks.launch).toHaveBeenCalledWith(
      "project-db",
      expect.objectContaining({ retryOfRunId: run.id, consent: true, promptIds: [prompt.id] }),
    );
    expect((await call("POST", `runs/${runId}/retry`, plan)).status).toBe(422);
    // The live planner requires a key even though the wave 4 registry calls it optional.
    expect(
      (await call("POST", `runs/${runId}/retry`, { ...plan, consent: true }, false)).status,
    ).toBe(422);
  });
  it("builds heuristic suggestions and a manual fallback from actual context", async () => {
    const response = await call("POST", "suggestions", { ignored: true });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      method: "context_template_heuristic",
      cost_usd: "0",
      requires_acceptance: true,
    });
    mocks.context.mockResolvedValue({
      business: "",
      audience: "",
      products: "",
      goals: "",
      agentRules: "",
      updatedAt: null,
    });
    const fallback = await call("POST", "suggestions");
    expect(fallback.status).toBe(200);
    expect((await fallback.json()).data).toMatchObject({ method: "manual_fallback", drafts: [] });
  });
});
