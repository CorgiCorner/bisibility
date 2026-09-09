import type { Prisma } from "@/lib/generated/prisma/client";
import {
  runOutcomeSchema,
  runStatusSchema,
  runTriggerSchema,
} from "@/lib/rank-check/runs/contract";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import { projectRunRankCheckPath } from "@/lib/routing/project-runs-path";
import type { ActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import type { z } from "zod";
import { adaptGscImport, type GscImportInput } from "./gsc-import-adapter";
import {
  isKnownProjectRunGscImportState,
  type ProjectRunAttention,
  type ProjectRunGscImport,
  type ProjectRunLifecycle,
  type ProjectRunRankCheck,
} from "./project-run";
import { gscActiveSnapshotRunState } from "./project-runs-gsc-snapshot";

export const rankRunSelect = {
  blockedReason: true,
  completedCount: true,
  costCents: true,
  createdAt: true,
  estimatedCostCents: true,
  finishedAt: true,
  keywordCount: true,
  launchedAt: true,
  outcome: true,
  plannedFor: true,
  publicId: true,
  startedAt: true,
  status: true,
  targetCount: true,
  totalCount: true,
  trigger: true,
} satisfies Prisma.RankCheckRunSelect;

export const gscImportSelect = {
  createdAt: true,
  daysDone: true,
  daysTotal: true,
  id: true,
  lastProbeAt: true,
  lastSyncFinishedAt: true,
  lastSyncStartedAt: true,
  pausedReason: true,
  projectId: true,
  property: true,
  searchType: true,
  source: true,
  state: true,
  syncStartedAt: true,
} satisfies Prisma.SearchAnalyticsImportSelect;

export type RankRunRow = Prisma.RankCheckRunGetPayload<{ select: typeof rankRunSelect }>;
export type GscImportRow = Prisma.SearchAnalyticsImportGetPayload<{
  select: typeof gscImportSelect;
}>;
export type ProjectRunsPresentationProject = Readonly<{
  id: string;
  name: string;
  publicId: string;
}>;

const GSC_PAUSE_REASONS = ["error", "needs_reauth", "rate_limited", "user"] as const;
const GSC_TERMINAL_STATES = ["completed", "failed"] as const;

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function rankAttention(
  row: RankRunRow,
  status: z.infer<typeof runStatusSchema>,
): ProjectRunAttention | null {
  if (status === "blocked") return { kind: "blocked", message: row.blockedReason };
  if (status === "completed" && row.outcome === "failed") return { kind: "failed", message: null };
  return null;
}

function rankTitle(trigger: z.infer<typeof runTriggerSchema>) {
  const titles: Record<z.infer<typeof runTriggerSchema>, string> = {
    api: "API rank check",
    manual: "Manual rank check",
    retry: "Retry rank check",
    scheduled: "Scheduled rank check",
  };
  return titles[trigger];
}

export function rankProjectRun(
  row: RankRunRow,
  project: ProjectRunsPresentationProject,
): ProjectRunRankCheck {
  const status = runStatusSchema.parse(row.status);
  const trigger = runTriggerSchema.parse(row.trigger);
  return {
    attention: rankAttention(row, status),
    capabilities: { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
    details: {
      costCents: row.costCents,
      estimatedCostCents: row.estimatedCostCents,
      outcome: runOutcomeSchema.nullable().parse(row.outcome),
      status,
      trigger,
    },
    href: projectRunRankCheckPath(asProjectRef(project.publicId), row.publicId),
    id: row.publicId as ProjectRunRankCheck["id"],
    kind: "rank_check",
    lifecycle: status as ProjectRunLifecycle,
    progress: { completed: row.completedCount, total: row.totalCount, unit: "targets" },
    project: {
      name: project.name,
      publicId: project.publicId as ProjectRunRankCheck["project"]["publicId"],
    },
    scope: { description: null, label: `${row.keywordCount} keywords` },
    timestamps: {
      createdAt: row.createdAt.toISOString(),
      finishedAt: iso(row.finishedAt),
      launchedAt: iso(row.launchedAt),
      plannedFor: iso(row.plannedFor),
      startedAt: iso(row.startedAt),
    },
    title: rankTitle(trigger),
  };
}

function knownPauseReason(value: string | null): ProjectRunGscImport["details"]["pausedReason"] {
  return (GSC_PAUSE_REASONS as readonly string[]).includes(value ?? "")
    ? (value as ProjectRunGscImport["details"]["pausedReason"])
    : null;
}

function gscAttention(state: string, pausedReason: string | null): ProjectRunAttention | null {
  if (state === "failed") return { kind: "failed", message: null };
  if (state !== "paused") return null;
  if (pausedReason === "needs_reauth") return { kind: "needs_reauthentication", message: null };
  if (pausedReason === "user") return { kind: "paused", message: null };
  if (pausedReason === "error") return { kind: "failed", message: null };
  return null;
}

function gscLifecycle(state: string, pausedReason: string | null): ProjectRunLifecycle {
  if (state === "paused" && pausedReason === "rate_limited") return "waiting_to_resume";
  return isKnownProjectRunGscImportState(state) ? state : "status_unavailable";
}

function matchesActiveSnapshot(
  record: Pick<GscImportInput, "id" | "property" | "state">,
  snapshot: ActiveSearchImportSnapshot | null,
) {
  return Boolean(
    snapshot &&
      !(GSC_TERMINAL_STATES as readonly string[]).includes(record.state) &&
      snapshot.id === record.id &&
      snapshot.property === record.property,
  );
}

function gscHref(projectRef: string, property: string) {
  const query = new URLSearchParams({ property });
  return `${searchConsolePath(asProjectRef(projectRef))}?${query.toString()}`;
}

export function gscProjectRun(
  row: GscImportRow,
  project: ProjectRunsPresentationProject,
  activeSnapshot: ActiveSearchImportSnapshot | null = null,
): ProjectRunGscImport | null {
  const record = adaptGscImport(row as GscImportInput);
  if (!record) return null;
  const snapshot = matchesActiveSnapshot(record, activeSnapshot) ? activeSnapshot : null;
  const snapshotState = snapshot ? gscActiveSnapshotRunState(snapshot) : null;
  return {
    attention: snapshotState?.attention ?? gscAttention(record.state, record.pausedReason),
    capabilities: snapshot
      ? { cancel: false, ...snapshot.capabilities, viewDetails: true }
      : { cancel: false, pause: false, resume: false, retry: false, viewDetails: true },
    details: {
      pausedReason: knownPauseReason(record.pausedReason),
      property: record.property,
      source: "gsc",
      state: record.state,
    },
    href: gscHref(project.publicId, record.property),
    id: record.id,
    kind: "gsc_import",
    lifecycle: snapshotState?.lifecycle ?? gscLifecycle(record.state, record.pausedReason),
    progress: snapshot
      ? { completed: snapshot.progress.done, total: snapshot.progress.total, unit: "days" }
      : { completed: null, total: null, unit: "days" },
    project: {
      name: project.name,
      publicId: project.publicId as ProjectRunGscImport["project"]["publicId"],
    },
    scope: { description: record.property, label: "Search Console" },
    timestamps: {
      createdAt: record.timestamps.createdAt.toISOString(),
      lastProbeAt: iso(record.timestamps.lastProbeAt),
      lastSyncFinishedAt: iso(record.timestamps.lastSyncFinishedAt),
      lastSyncStartedAt: iso(record.timestamps.lastSyncStartedAt),
      syncStartedAt: iso(record.timestamps.syncStartedAt),
    },
    title: "Search Console import",
  };
}
