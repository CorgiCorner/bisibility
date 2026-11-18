import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  scope: vi.fn(),
  save: vi.fn(),
  track: vi.fn(),
  context: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.auth,
  requireProjectScope: mocks.scope,
}));
vi.mock("@/lib/auth/authorize", () => ({
  getProjectRole: (actor: { role?: string }) => actor.role ?? "owner",
}));
vi.mock("@/lib/model-playground/database", () => ({ modelPlaygroundDatabase: {} }));
vi.mock("@/lib/model-playground/report", () => ({ saveModelPlaygroundReport: mocks.save }));
vi.mock("@/lib/model-playground/track-prompt-store", () => ({
  trackModelPlaygroundWithPromptStore: mocks.track,
}));
vi.mock("@/lib/ai-tracking/stores/prompts", () => ({ createPrompt: vi.fn() }));
vi.mock("@/lib/model-playground/report-context", () => ({
  loadModelReportEntities: mocks.context,
}));

import { trackModelPlaygroundAction } from "./model-playground-track";
import { saveModelPlaygroundReportAction } from "./research-history";

const input = {
  projectRef: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
  runId: "019a70b2-0000-7000-8000-000000000001",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: "actor" });
  mocks.scope.mockResolvedValue({ id: "project" });
  mocks.context.mockResolvedValue([]);
  mocks.save.mockResolvedValue({ ok: true, reportId: "report", alreadySaved: false });
  mocks.track.mockResolvedValue({
    ok: true,
    promptId: "prompt",
    presetId: "preset",
    reused: false,
  });
});
it.each(["report", "track"])(
  "authorizes %s before reading run, topic, or revealing malformed input",
  async (kind) => {
    const action = kind === "report" ? saveModelPlaygroundReportAction : trackModelPlaygroundAction;
    mocks.scope.mockRejectedValueOnce(new Error("denied"));
    expect(await action({ ...input, runId: "invalid", apiKey: "synthetic" })).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect((await action(kind === "report" ? input : { ...input, topicId: null })).ok).toBe(true);
    expect(mocks.scope).toHaveBeenLastCalledWith(
      { id: "actor" },
      "update",
      input.projectRef,
      { type: "project" },
      ...(kind === "report" ? [{ allowReadOnly: true }] : []),
    );
  },
);
it("refuses extra configuration and turns report storage failure into a typed result", async () => {
  expect(await trackModelPlaygroundAction({ ...input, topicId: null, config: {} })).toEqual({
    ok: false,
    reason: "invalid_input",
  });
  mocks.save.mockRejectedValueOnce(new Error("secret database error"));
  expect(await saveModelPlaygroundReportAction(input)).toEqual({ ok: false, reason: "storage" });
  expect((await saveModelPlaygroundReportAction(input)).ok).toBe(true);
});

it.each([
  { role: "viewer", writeMode: "active" },
  { role: "owner", writeMode: "migration_hold" },
])(
  "enforces tracking role and write mode before malformed input: %j",
  async ({ role, writeMode }) => {
    mocks.auth.mockResolvedValue({ id: "actor", role });
    mocks.scope.mockResolvedValue({ id: "project", writeMode });
    expect(await trackModelPlaygroundAction({ ...input, runId: "invalid" })).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(mocks.track).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ id: "actor", role: "owner" });
    mocks.scope.mockResolvedValue({ id: "project", writeMode: "active" });
    expect((await trackModelPlaygroundAction({ ...input, topicId: null })).ok).toBe(true);
  },
);

it.each([undefined, false, true])(
  "passes explicit user intent %s to the shared report service",
  async (explicit) => {
    await saveModelPlaygroundReportAction({
      ...input,
      ...(explicit === undefined ? {} : { explicit }),
    });
    expect(mocks.context).toHaveBeenCalledWith({}, "project");
    expect(mocks.save).toHaveBeenCalledWith(
      {},
      { projectId: "project", runId: input.runId },
      [],
      false,
      explicit === true,
      { userSave: true },
    );
  },
);
