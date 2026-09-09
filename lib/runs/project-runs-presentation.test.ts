import type { ActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import { describe, expect, it } from "vitest";
import type { GscImportRow } from "./project-runs-presentation";
import { gscProjectRun } from "./project-runs-presentation";

const project = {
  id: "project_1",
  name: "Example project",
  publicId: "prj_a00000000000000000000000",
};

function importRow(overrides: Record<string, unknown> = {}): GscImportRow {
  const at = new Date("2026-09-06T12:00:00.000Z");
  return {
    createdAt: at,
    daysDone: 28,
    daysTotal: 28,
    id: "import_1",
    lastProbeAt: at,
    lastSyncFinishedAt: at,
    lastSyncStartedAt: at,
    pausedReason: null,
    projectId: project.id,
    property: "sc-domain:example.com",
    searchType: "web",
    source: "gsc",
    state: "completed",
    syncStartedAt: at,
    ...overrides,
  } as GscImportRow;
}

function activeSnapshot(overrides: Record<string, unknown> = {}): ActiveSearchImportSnapshot {
  return {
    capabilities: { pause: true, resume: false, retry: false },
    id: "import_1",
    presentation: {
      action: "pause",
      kind: "running",
      supportingText: "Import is running.",
      title: "Importing",
    },
    progress: { done: 28, total: 488 },
    property: "sc-domain:example.com",
    state: "running",
    ...overrides,
  } as ActiveSearchImportSnapshot;
}

describe("GSC project-run presentation", () => {
  it("keeps the stored property in a read-only, encoded Search Console href", () => {
    const run = gscProjectRun(
      importRow({ property: "sc-domain:example.com/path?from=stored value" }),
      project,
    );

    expect(run?.href).toBe(
      "/app/prj_a00000000000000000000000/search-console?property=sc-domain%3Aexample.com%2Fpath%3Ffrom%3Dstored+value",
    );
    expect(new URL(run?.href ?? "", "https://example.test").searchParams.get("property")).toBe(
      "sc-domain:example.com/path?from=stored value",
    );
  });

  it("keeps durable GSC progress indeterminate until a coverage snapshot is available", () => {
    const run = gscProjectRun(
      importRow({ daysDone: 28, daysTotal: 28, state: "completed" }),
      project,
    );

    expect(run?.progress).toEqual({ completed: null, total: null, unit: "days" });
  });

  it("uses one matching active snapshot for qualifying progress and delayed attention", () => {
    const running = gscProjectRun(importRow({ state: "running" }), project, activeSnapshot());
    const delayed = gscProjectRun(
      importRow({ state: "running" }),
      project,
      activeSnapshot({
        presentation: {
          action: null,
          kind: "waiting_worker",
          supportingText: "The active worker is unavailable.",
          title: "Delayed",
        },
      }),
    );

    expect(running).toMatchObject({
      capabilities: { pause: true, resume: false, retry: false },
      lifecycle: "running",
      progress: { completed: 28, total: 488, unit: "days" },
    });
    expect(delayed).toMatchObject({
      attention: { kind: "worker_unavailable" },
      lifecycle: "status_unavailable",
    });
  });

  it("keeps terminal and property-mismatched rows on durable facts", () => {
    const snapshot = activeSnapshot();
    const terminal = gscProjectRun(importRow({ state: "completed" }), project, snapshot);
    const archived = gscProjectRun(
      importRow({
        id: "import_archived",
        property: "sc-domain:archived.example.com",
        state: "running",
      }),
      project,
      snapshot,
    );

    expect(terminal).toMatchObject({
      capabilities: { pause: false, resume: false, retry: false },
      lifecycle: "completed",
      progress: { completed: null, total: null, unit: "days" },
    });
    expect(archived).toMatchObject({
      capabilities: { pause: false, resume: false, retry: false },
      lifecycle: "running",
      progress: { completed: null, total: null, unit: "days" },
    });
  });

  it("maps durable pause reasons without reading current connection state", () => {
    const rateLimited = gscProjectRun(
      importRow({ pausedReason: "rate_limited", state: "paused" }),
      project,
    );
    const userPaused = gscProjectRun(importRow({ pausedReason: "user", state: "paused" }), project);
    const errored = gscProjectRun(importRow({ pausedReason: "error", state: "paused" }), project);
    const needsReauth = gscProjectRun(
      importRow({ pausedReason: "needs_reauth", state: "paused" }),
      project,
    );

    expect(rateLimited).toMatchObject({ attention: null, lifecycle: "waiting_to_resume" });
    expect(userPaused).toMatchObject({ attention: { kind: "paused" }, lifecycle: "paused" });
    expect(errored).toMatchObject({ attention: { kind: "failed" }, lifecycle: "paused" });
    expect(needsReauth).toMatchObject({
      attention: { kind: "needs_reauthentication" },
      lifecycle: "paused",
    });
  });
});
