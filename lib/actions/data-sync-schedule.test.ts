import { type Actor, AuthorizationError, authorize } from "@/lib/auth/authorize";
import { beforeEach, expect, it, vi } from "vitest";
import { setDataSyncScheduleState } from "./data-sync-schedule";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  scope: vi.fn(),
  setState: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("@/lib/schedules/mutations", () => ({ setScheduleState: mocks.setState }));
vi.mock("@/lib/schedules/review-commit", () => ({ WEB_UNGATED_REVIEW: { review: "web_ungated" } }));
vi.mock("./_shared", () => ({
  getActionActor: async () => mocks.actor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.scope,
}));

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const input = { projectId, syncKind: "search_console", enabled: false };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue({ id: "project_1", publicId: projectId });
});

it.each([
  ["domain_rating", "manage", "provider_connection"],
  ["sitemap", "update", "sitemap_monitor"],
  ["search_console", "update", "project"],
  ["page_indexing", "update", "project_defaults"],
])("authorizes %s with its own control's permission", async (syncKind, action, type) => {
  await setDataSyncScheduleState({ ...input, syncKind });
  expect(mocks.scope).toHaveBeenCalledWith(mocks.actor, action, projectId, { type });
});

it("authorizes write access and pauses through the unified schedule mutation", async () => {
  await expect(setDataSyncScheduleState(input)).resolves.toEqual({ ok: true });
  expect(mocks.scope).toHaveBeenCalledWith(mocks.actor, "update", projectId, {
    type: "project",
  });
  expect(mocks.setState).toHaveBeenCalledWith(
    "project_1",
    mocks.actor,
    `sync:${projectId}:search_console`,
    "paused",
    { kind: "data_sync", syncKind: "search_console", projectPublicId: projectId },
    { review: "web_ungated" },
  );
  expect(mocks.revalidate).toHaveBeenCalled();
});

it("rejects a viewer before issuing a mutation", async () => {
  mocks.scope.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(setDataSyncScheduleState(input)).rejects.toThrow("Forbidden");
  expect(mocks.setState).not.toHaveBeenCalled();
});

it("rejects an unsupported sync kind before using project scope", async () => {
  await expect(setDataSyncScheduleState({ ...input, syncKind: "future_sync" })).rejects.toThrow();
  expect(mocks.scope).not.toHaveBeenCalled();
  expect(mocks.setState).not.toHaveBeenCalled();
});

it.each([
  ["member", 403],
  ["admin", 200],
] as const)("gives a %s Domain Rating pause the provider admin rule", async (role, status) => {
  const actor: Actor = { id: "user_1", memberships: [{ projectId: "project_1", role }] };
  mocks.scope.mockImplementation(async (scopeActor, action, _projectId, resource) => {
    authorize(scopeActor, action, { ...resource, projectId: "project_1" });
    return { id: "project_1", publicId: projectId };
  });
  Object.assign(mocks.actor, actor);
  const result = setDataSyncScheduleState({ ...input, syncKind: "domain_rating" });
  if (status === 403) {
    await expect(result).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.setState).not.toHaveBeenCalled();
  } else {
    await expect(result).resolves.toEqual({ ok: true });
    expect(mocks.setState).toHaveBeenCalledTimes(1);
  }
});
