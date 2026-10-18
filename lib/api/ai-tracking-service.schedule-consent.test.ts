import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutateTrackingCatalog } from "./ai-tracking-service";

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  archiveSchedule: vi.fn(),
  createSchedule: vi.fn(),
  listPrompts: vi.fn(),
  listSchedules: vi.fn(),
  resolveConnection: vi.fn(),
  updateSchedule: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: vi.fn() }));
vi.mock("@/lib/ai-tracking/admission/launch", () => ({
  approveTrackingConfiguration: mocks.approve,
  launchTrackingRun: vi.fn(),
  previewTrackingRun: vi.fn(),
}));
vi.mock("@/lib/ai-tracking/queries/connections", () => ({
  resolveTrackingConnection: mocks.resolveConnection,
}));
vi.mock("@/lib/ai-tracking/queries/runs", () => ({ listTrackingRuns: vi.fn() }));
vi.mock("@/lib/ai-tracking/queries/samples", () => ({ listTrackingSamples: vi.fn() }));
vi.mock("@/lib/ai-tracking/stores/prompts", () => ({
  archivePrompt: vi.fn(),
  createPrompt: vi.fn(),
  listPromptRevisions: vi.fn(),
  listPrompts: mocks.listPrompts,
  updatePrompt: vi.fn(),
}));
vi.mock("@/lib/ai-tracking/stores/runs", () => ({
  cancelTrackingRun: vi.fn(),
  getTrackingRun: vi.fn(),
}));
vi.mock("@/lib/ai-tracking/stores/schedules", () => ({
  archiveSchedule: mocks.archiveSchedule,
  createSchedule: mocks.createSchedule,
  listSchedules: mocks.listSchedules,
  updateSchedule: mocks.updateSchedule,
}));
vi.mock("@/lib/ai-tracking/stores/topics", () => ({
  archiveTopic: vi.fn(),
  createTopic: vi.fn(),
  listTopics: vi.fn(),
  updateTopic: vi.fn(),
}));

const configuration = {
  actorId: "user_1",
  idempotencyKey: "request_1",
  promptIds: ["aip_neutral"],
  configurations: [
    {
      provider: "dataforseo",
      source: "consumer_scrape",
      engine: "chat_gpt",
      endpoint: "ai_optimization/chat_gpt/llm_scraper/task_post",
      model: null,
      parameters: { language_code: "en", location_name: "United States" },
    },
  ],
  credentialConnectionId: "apc_connection",
  credentialVersion: "credential_1",
  budgetRevision: "budget_1",
  consentRevision: "consent_1",
  origin: "manual",
  entrySource: "app",
  deadline: "2026-10-20T09:00:00.000Z",
};
const metadata = { name: "Weekly", cron: "0 9 * * 1", timezone: "UTC" };

function savedSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: "schedule_1",
    publicId: "ais_weekly",
    enabled: false,
    archivedAt: null,
    ...overrides,
  };
}

describe("AI schedule consent at the shared server mutation path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSchedules.mockResolvedValue([savedSchedule()]);
    mocks.listPrompts.mockResolvedValue([{ id: "prompt_1", publicId: "aip_neutral" }]);
    mocks.resolveConnection.mockResolvedValue({ id: "connection_1" });
    mocks.updateSchedule.mockResolvedValue({});
    mocks.archiveSchedule.mockResolvedValue({});
    mocks.approve.mockResolvedValue({});
  });

  it("rejects a metadata-only enable of a disabled schedule without touching storage", async () => {
    await expect(
      mutateTrackingCatalog("project_1", "schedules", "PATCH", { enabled: true }, "ais_weekly"),
    ).rejects.toThrow("Enabling requires reviewed configuration and explicit budget consent.");
    await expect(
      mutateTrackingCatalog(
        "project_1",
        "schedules",
        "PATCH",
        { ...metadata, enabled: true, consent: true },
        "ais_weekly",
      ),
    ).rejects.toThrow("Enabling requires reviewed configuration and explicit budget consent.");
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("pauses through the metadata path without consent", async () => {
    mocks.listSchedules.mockResolvedValue([savedSchedule({ enabled: true })]);
    await mutateTrackingCatalog(
      "project_1",
      "schedules",
      "PATCH",
      { enabled: false },
      "ais_weekly",
    );
    expect(mocks.updateSchedule).toHaveBeenCalledWith("project_1", "schedule_1", {
      enabled: false,
    });
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("passes only an explicit consent flag to approval for a reviewed enable", async () => {
    await mutateTrackingCatalog(
      "project_1",
      "schedules",
      "PATCH",
      { ...metadata, enabled: true, configuration },
      "ais_weekly",
    );
    expect(mocks.approve).toHaveBeenCalledWith(
      "project_1",
      expect.objectContaining({ consent: false, promptIds: ["prompt_1"] }),
    );
    await mutateTrackingCatalog(
      "project_1",
      "schedules",
      "PATCH",
      { ...metadata, enabled: true, consent: true, configuration },
      "ais_weekly",
    );
    expect(mocks.approve).toHaveBeenLastCalledWith(
      "project_1",
      expect.objectContaining({ consent: true, credentialConnectionId: "connection_1" }),
    );
  });

  it("stops before update when approval rejects missing consent", async () => {
    mocks.approve.mockRejectedValue(new Error("Explicit budget consent is required."));
    await expect(
      mutateTrackingCatalog(
        "project_1",
        "schedules",
        "PATCH",
        { ...metadata, enabled: true, configuration },
        "ais_weekly",
      ),
    ).rejects.toThrow("Explicit budget consent is required.");
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
  });

  it("archives without consent and refuses to edit an archived schedule", async () => {
    await mutateTrackingCatalog("project_1", "schedules", "DELETE", {}, "ais_weekly");
    expect(mocks.archiveSchedule).toHaveBeenCalledWith("project_1", "schedule_1");
    mocks.listSchedules.mockResolvedValue([savedSchedule({ archivedAt: new Date() })]);
    await expect(
      mutateTrackingCatalog("project_1", "schedules", "PATCH", { name: "Renamed" }, "ais_weekly"),
    ).rejects.toThrow("Schedule not found.");
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
  });
});
