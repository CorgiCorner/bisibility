import type { ProjectRunAi, ProjectRunGscImport } from "@/lib/runs/project-run";

export const aiRunFixture: ProjectRunAi = {
  id: "air_abcdefghijklmnopqrstuvwx",
  kind: "ai",
  lifecycle: "running",
  attention: null,
  capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
  cost: { actualCents: 3.72, estimatedCents: null, state: "partial" },
  details: { state: "running", reason: null },
  href: "/app/prj_abcdefghijklmnopqrstuvwx/runs/ai/air_abcdefghijklmnopqrstuvwx",
  project: { name: "Example project", publicId: "prj_abcdefghijklmnopqrstuvwx" },
  scope: { kind: "ai", description: null },
  progress: { completed: 8, total: 12, unit: "samples" },
  timestamps: {
    createdAt: "2026-10-21T07:00:00Z",
    startedAt: "2026-10-21T07:01:00Z",
    finishedAt: null,
    plannedFor: "2026-10-21T07:00:00Z",
  },
  title: { kind: "ai" },
};
const aiHistoryRows: ProjectRunAi[] = [
  {
    ...aiRunFixture,
    id: "air_bbcdefghijklmnopqrstuvwx",
    lifecycle: "skipped",
    details: { state: "skipped", reason: "cost_limit_exceeded" },
    attention: { kind: "cost_limit_exceeded", message: "cost_limit_exceeded" },
    progress: { completed: 0, total: 0, unit: "samples" },
    cost: { actualCents: null, estimatedCents: null, state: "unknown" },
    timestamps: { ...aiRunFixture.timestamps, startedAt: null, finishedAt: "2026-10-20T07:00:00Z" },
  },
  {
    ...aiRunFixture,
    id: "air_cbcdefghijklmnopqrstuvwx",
    lifecycle: "partial",
    details: { state: "partial", reason: null },
    attention: { kind: "blocked", message: null },
    progress: { completed: 12, total: 12, unit: "samples" },
    cost: { actualCents: 5.6, estimatedCents: null, state: "confirmed" },
    timestamps: { ...aiRunFixture.timestamps, finishedAt: "2026-10-19T07:03:00Z" },
  },
];
export const aiHistoryFixtures = aiHistoryRows.map((run) => ({
  ...run,
  href: `/app/prj_abcdefghijklmnopqrstuvwx/runs/ai/${run.id}`,
}));

export const gscRunFixture: ProjectRunGscImport = {
  id: "import_fixture",
  kind: "gsc",
  lifecycle: "running",
  attention: null,
  capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
  cost: { actualCents: null, estimatedCents: null, state: "not_applicable" },
  details: {
    pausedReason: null,
    property: "sc-domain:example.com",
    source: "gsc",
    state: "running",
  },
  href: "/app/prj_abcdefghijklmnopqrstuvwx/search-console?property=sc-domain%3Aexample.com",
  project: aiRunFixture.project,
  scope: { kind: "gsc", description: "sc-domain:example.com" },
  progress: { completed: 28, total: 90, unit: "days" },
  timestamps: {
    ...aiRunFixture.timestamps,
    lastProbeAt: null,
    lastSyncFinishedAt: null,
    lastSyncStartedAt: aiRunFixture.timestamps.startedAt,
    syncStartedAt: aiRunFixture.timestamps.startedAt,
  },
  title: { kind: "gsc" },
};
