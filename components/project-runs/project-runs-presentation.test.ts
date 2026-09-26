import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import type { ProjectRun } from "@/lib/runs/project-run";
import { describe, expect, it } from "vitest";
import { applyOperationSnapshotToRuns } from "./project-runs-presentation";

const rankRun: ProjectRun = {
  attention: null,
  capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
  details: {
    costCents: null,
    estimatedCostCents: null,
    outcome: null,
    status: "running",
    trigger: "manual",
  },
  href: "/app/prj_example/runs/rank-checks/rcr_example",
  id: "rcr_example",
  kind: "rank_check",
  lifecycle: "running",
  progress: { completed: 2, total: 10, unit: "targets" },
  project: { name: "Example", publicId: "prj_example" },
  scope: { description: null, keywordCount: 10, kind: "rank_check" },
  timestamps: {
    createdAt: "2026-09-06T10:00:00.000Z",
    finishedAt: null,
    launchedAt: "2026-09-06T10:00:00.000Z",
    plannedFor: null,
    startedAt: "2026-09-06T10:00:00.000Z",
  },
  title: { kind: "rank_check", trigger: "manual" },
};

const importRun: ProjectRun = {
  attention: null,
  capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
  details: {
    pausedReason: null,
    property: "sc-domain:example.com",
    source: "gsc",
    state: "running",
  },
  href: "/app/prj_example/search-console?property=sc-domain%3Aexample.com",
  id: "import_1",
  kind: "gsc_import",
  lifecycle: "running",
  progress: { completed: null, total: null, unit: "days" },
  project: { name: "Example", publicId: "prj_example" },
  scope: { description: "sc-domain:example.com", kind: "gsc_import" },
  timestamps: {
    createdAt: "2026-09-06T09:00:00.000Z",
    lastProbeAt: null,
    lastSyncFinishedAt: null,
    lastSyncStartedAt: "2026-09-06T09:10:00.000Z",
    syncStartedAt: "2026-09-06T09:10:00.000Z",
  },
  title: { kind: "gsc_import" },
};

const activeImport: OperationSnapshot = {
  capabilities: { pause: true, resume: false, retry: false },
  id: "import_1",
  kind: "gsc_import",
  presentation: { action: "pause", supportingText: null, title: "Importing" },
  progress: { done: 28, total: 488 },
  property: "sc-domain:example.com",
  state: "running",
};

describe("applyOperationSnapshotToRuns", () => {
  it("uses qualifying GSC coverage from the one matching active snapshot", () => {
    expect(applyOperationSnapshotToRuns([rankRun, importRun], [activeImport])).toEqual([
      rankRun,
      {
        ...importRun,
        progress: { completed: 28, total: 488, unit: "days" },
        snapshotState: "Importing",
      },
    ]);
  });

  it("keeps rate-limit presentation from the matching active import snapshot", () => {
    expect(
      applyOperationSnapshotToRuns(
        [{ ...importRun, lifecycle: "waiting_to_resume" }],
        [
          {
            ...activeImport,
            capabilities: { pause: false, resume: false, retry: false },
            presentation: {
              action: null,
              supportingText: "Google will resume the import automatically when its limit allows.",
              title: "Waiting for Google",
            },
          },
        ],
      ),
    ).toEqual([
      {
        ...importRun,
        lifecycle: "waiting_to_resume",
        progress: { completed: 28, total: 488, unit: "days" },
        snapshotState: "Waiting for Google",
      },
    ]);
  });

  it("assigns attention tone to a delayed active snapshot", () => {
    expect(
      applyOperationSnapshotToRuns(
        [importRun],
        [
          {
            ...activeImport,
            presentation: { action: null, supportingText: null, title: "Delayed" },
          },
        ],
      ),
    ).toMatchObject([{ snapshotState: "Delayed" }]);
  });

  it("does not infer coverage for another durable import row", () => {
    expect(
      applyOperationSnapshotToRuns([importRun], [{ ...activeImport, id: "import_other" }]),
    ).toEqual([importRun]);
  });
});
