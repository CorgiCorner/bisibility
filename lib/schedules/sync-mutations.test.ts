import { beforeEach, expect, it, vi } from "vitest";
import { ScheduleTransitionError } from "./errors";
import { setScheduleState, updateSchedule } from "./mutations";
import { WEB_UNGATED_REVIEW } from "./review-commit";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  createPause: vi.fn(),
  defaults: vi.fn(),
  deletePause: vi.fn(),
  importCount: vi.fn(),
  importRows: vi.fn(),
  importUpdate: vi.fn(),
  read: vi.fn(),
  sitemap: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.audit,
  writeAuditFailure: async () => undefined,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (execute: (tx: unknown) => Promise<unknown>) =>
      execute({
        $queryRaw: vi.fn(),
        projectSyncPause: { create: mocks.createPause, deleteMany: mocks.deletePause },
        projectDefaults: {
          update: mocks.defaults,
          updateMany: mocks.defaults,
          upsert: mocks.defaults,
        },
        project: { findUniqueOrThrow: mocks.read, update: mocks.update },
        searchAnalyticsImport: {
          count: mocks.importCount,
          findMany: mocks.importRows,
          updateMany: mocks.importUpdate,
        },
      }),
    project: {
      findFirst: async (query: { where: { id: string; publicId: string } }) =>
        query.where.id === "project_1" && query.where.publicId === projectPublicId
          ? {
              syncPauses: [],
              publicId: projectPublicId,
            }
          : null,
    },
  },
}));
vi.mock("@/lib/sitemap/monitors", () => ({ updateSitemapMonitor: mocks.sitemap }));

const actor = { id: "user_1", memberships: [{ projectId: "project_1", role: "admin" as const }] };
const member = { id: "user_2", memberships: [{ projectId: "project_1", role: "member" as const }] };
const projectPublicId = "prj_a00000000000000000000000";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ syncPauses: [] });
  mocks.importCount.mockResolvedValue(0);
  mocks.importRows.mockResolvedValue([]);
  mocks.importUpdate.mockResolvedValue({ count: 1 });
});

it("writes the domain rating pause and its legacy mirror, and delegates the sitemap write", async () => {
  await setScheduleState(
    "project_1",
    actor,
    `sync:${projectPublicId}:domain_rating`,
    "paused",
    {
      kind: "data_sync",
      projectPublicId,
      syncKind: "domain_rating",
    },
    WEB_UNGATED_REVIEW,
  );
  expect(mocks.createPause).toHaveBeenCalledWith({
    data: { actorId: actor.id, kind: "domain_rating", projectId: "project_1" },
  });
  expect(mocks.update).toHaveBeenCalledWith({
    data: { domainRatingEnabled: false },
    where: { id: "project_1" },
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "project.domain_rating.update",
      after: { enabled: false },
      before: { enabled: true },
    }),
    expect.anything(),
  );
  await setScheduleState(
    "project_1",
    actor,
    `sync:${projectPublicId}:sitemap`,
    "active",
    {
      kind: "data_sync",
      projectPublicId,
      syncKind: "sitemap",
    },
    WEB_UNGATED_REVIEW,
  );
  expect(mocks.sitemap).toHaveBeenCalledWith({
    actor,
    enabled: true,
    monitorId: projectPublicId,
    projectId: projectPublicId,
  });
});

it.each([
  ["search_console", "search_console_import"],
  ["page_indexing", "page_indexing"],
] as const)("persists and audits %s pause and resume", async (syncKind, kind) => {
  const imports = syncKind === "search_console" ? { importPauses: 0 } : {};
  const id = `sync:${projectPublicId}:${syncKind}`;
  const command = { kind: "data_sync" as const, projectPublicId, syncKind };
  await setScheduleState("project_1", actor, id, "paused", command, WEB_UNGATED_REVIEW);
  expect(mocks.createPause).toHaveBeenCalledWith({
    data: { actorId: actor.id, kind, projectId: "project_1" },
  });
  expect(mocks.audit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "project.data_sync.update",
      before: { enabled: true, kind, ...imports },
      after: { enabled: false, kind, ...imports },
    }),
    expect.anything(),
  );

  mocks.read.mockResolvedValueOnce({ syncPauses: [{ kind }] });
  await setScheduleState("project_1", actor, id, "active", command, WEB_UNGATED_REVIEW);
  expect(mocks.deletePause).toHaveBeenCalledWith({ where: { projectId: "project_1", kind } });
  expect(mocks.audit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "project.data_sync.update",
      before: { enabled: false, kind, ...imports },
      after: { enabled: true, kind, ...imports },
    }),
    expect.anything(),
  );
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.importUpdate).not.toHaveBeenCalled();
});

it("pauses and resumes public page indexing without touching the inspection budget", async () => {
  const id = `sync:${projectPublicId}:page_indexing`;
  const command = {
    kind: "data_sync" as const,
    projectPublicId,
    syncKind: "page_indexing" as const,
    publicWrite: true as const,
  };
  await setScheduleState("project_1", actor, id, "paused", command, WEB_UNGATED_REVIEW);
  mocks.read.mockResolvedValueOnce({ syncPauses: [{ kind: "page_indexing" }] });
  await setScheduleState("project_1", actor, id, "active", command, WEB_UNGATED_REVIEW);
  expect(mocks.createPause).toHaveBeenCalledTimes(1);
  expect(mocks.deletePause).toHaveBeenCalledTimes(1);
  // The budget mode (for example available_quota) is the page's own setting; the switch keeps it.
  expect(mocks.defaults).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("resumes a property-level Search Console pause from Schedules in the same audit", async () => {
  const id = `sync:${projectPublicId}:search_console`;
  const command = {
    kind: "data_sync" as const,
    projectPublicId,
    syncKind: "search_console" as const,
  };
  const kind = "search_console_import";
  mocks.importCount.mockResolvedValue(1);
  await setScheduleState("project_1", actor, id, "paused", command, WEB_UNGATED_REVIEW);
  // Pausing adds the Schedules pause and leaves the property-level control as it was.
  expect(mocks.createPause).toHaveBeenCalledWith({
    data: { actorId: actor.id, kind, projectId: "project_1" },
  });
  expect(mocks.importUpdate).not.toHaveBeenCalled();
  expect(mocks.audit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      before: { enabled: false, kind, importPauses: 1 },
      after: { enabled: false, kind, importPauses: 1 },
    }),
    expect.anything(),
  );

  mocks.read.mockResolvedValueOnce({ syncPauses: [{ kind }] });
  mocks.importRows.mockResolvedValueOnce([
    { cursorDate: null, earliestTargetDate: null, id: "imp_1" },
  ]);
  await setScheduleState("project_1", actor, id, "active", command, WEB_UNGATED_REVIEW);
  expect(mocks.deletePause).toHaveBeenCalledWith({ where: { projectId: "project_1", kind } });
  expect(mocks.importUpdate).toHaveBeenCalledWith({
    data: expect.objectContaining({ pausedReason: null, pausedById: null, state: "queued" }),
    where: { id: "imp_1", pausedReason: "user", projectId: "project_1", source: "gsc" },
  });
  expect(mocks.audit).toHaveBeenCalledTimes(2);
  expect(mocks.audit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "project.data_sync.update",
      before: { enabled: false, kind, importPauses: 1 },
      after: { enabled: true, kind, importPauses: 0 },
    }),
    expect.anything(),
  );
});

it("resumes a Search Console import paused only on its card", async () => {
  mocks.importCount.mockResolvedValue(1);
  mocks.importRows.mockResolvedValueOnce([
    {
      cursorDate: new Date("2026-01-01T00:00:00Z"),
      earliestTargetDate: new Date("2026-02-01T00:00:00Z"),
      id: "imp_1",
    },
  ]);
  await setScheduleState(
    "project_1",
    actor,
    `sync:${projectPublicId}:search_console`,
    "active",
    { kind: "data_sync", projectPublicId, syncKind: "search_console" },
    WEB_UNGATED_REVIEW,
  );
  expect(mocks.deletePause).not.toHaveBeenCalled();
  expect(mocks.importUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ state: "completed" }) }),
  );
});

it("rejects archiving a data sync as a lifecycle transition", async () => {
  await expect(
    setScheduleState(
      "project_1",
      actor,
      `sync:${projectPublicId}:domain_rating`,
      "archived",
      {
        kind: "data_sync",
        projectPublicId,
        syncKind: "domain_rating",
      },
      WEB_UNGATED_REVIEW,
    ),
  ).rejects.toBeInstanceOf(ScheduleTransitionError);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("rejects a data sync whose project id does not match the authorized project", async () => {
  await expect(
    setScheduleState(
      "project_1",
      actor,
      `sync:${projectPublicId}:domain_rating`,
      "paused",
      {
        kind: "data_sync",
        projectPublicId: `prj_${"b".repeat(24)}`,
        syncKind: "domain_rating",
      },
      WEB_UNGATED_REVIEW,
    ),
  ).rejects.toMatchObject({ code: "schedule_not_found" });
  expect(mocks.update).not.toHaveBeenCalled();
});

it("accepts only state changes for a data sync", async () => {
  await expect(
    updateSchedule(
      "project_1",
      actor,
      `sync:${projectPublicId}:sitemap`,
      {
        kind: "data_sync",
        syncKind: "sitemap",
      },
      WEB_UNGATED_REVIEW,
    ),
  ).rejects.toMatchObject({ code: "data_sync_state_unsupported" });
  expect(mocks.sitemap).not.toHaveBeenCalled();
});

it("refuses a member's Domain Rating pause before writing and lets an admin pause it", async () => {
  const id = `sync:${projectPublicId}:domain_rating`;
  const command = {
    kind: "data_sync" as const,
    projectPublicId,
    syncKind: "domain_rating" as const,
  };
  await expect(
    setScheduleState("project_1", member, id, "paused", command, WEB_UNGATED_REVIEW),
  ).rejects.toMatchObject({ name: "AuthorizationError", code: "forbidden" });
  expect(mocks.createPause).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();

  await setScheduleState("project_1", actor, id, "paused", command, WEB_UNGATED_REVIEW);
  expect(mocks.createPause).toHaveBeenCalledTimes(1);
});

it.each(["sitemap", "search_console", "page_indexing"] as const)(
  "lets a member change %s, matching that sync's own control",
  async (syncKind) => {
    await setScheduleState(
      "project_1",
      member,
      `sync:${projectPublicId}:${syncKind}`,
      "paused",
      { kind: "data_sync", projectPublicId, syncKind },
      WEB_UNGATED_REVIEW,
    );
    if (syncKind === "sitemap") expect(mocks.sitemap).toHaveBeenCalledTimes(1);
    else expect(mocks.createPause).toHaveBeenCalledTimes(1);
  },
);
