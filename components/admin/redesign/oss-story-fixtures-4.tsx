import { baseData } from "@/components/admin/admin-dashboard-test-fixtures";
import { sampleData } from "./oss-story-fixtures-1";
import { recovery } from "./oss-story-fixtures-2";
import { recoveryPage, recoveryRuns, recoveryScenario } from "./oss-story-fixtures-3";
import { requireFixture } from "./require-fixture";
export const recoveryPreview = {
  token: "sample",
  expiresAt: "2026-11-03T10:00:00Z",
  eligible: [
    { caseToken: "proof-1", action: "recover_proof" as const },
    { caseToken: "result-1", action: "restore_result" as const },
    { caseToken: "result-2", action: "restore_result" as const },
    ...recoveryRuns.map((caseToken) => ({ caseToken, action: "resume_queued_run" as const })),
  ],
  excluded: [{ caseToken: "sample-excluded", reason: "Needs evidence" }],
  newPaidAttempts: 0 as const,
  providerCalls: 0 as const,
  originalRuns: recoveryRuns.length,
  originalExposure: recoveryRuns.map((caseToken, index) => ({
    caseToken,
    project: `prj_example_queued_${index + 1}`,
    funding: "byok" as const,
    maxCostCents: "2",
    targets: 1,
    maxAttempts: 1,
  })),
};

export const RecoveryParity = recoveryScenario({ page: recoveryPage });

export const RecoverySelectionLimit = recoveryScenario({
  page: {
    ...recoveryPage,
    rows: Array.from({ length: 26 }, (_, i) => ({
      ...recoveryPage.rows[1],
      token: `case-limit-${i}`,
      project: `project-limit-${i}`,
    })),
  },
});

export const RecoveryEmpty = recoveryScenario({
  page: { ...recoveryPage, rows: [], partialEvidence: [], nextCursor: null },
});

export const RecoveryUnavailable = recoveryScenario({ page: null });

export const RecoveryLoading = recoveryScenario({ page: recoveryPage, busy: true });

export const RecoveryError = recoveryScenario({
  page: recoveryPage,
  error: "Recovery could not be updated. Try again.",
});

export const RecoveryCommandError = recoveryScenario({
  page: recoveryPage,
  commandError: "Command status is unavailable.",
});

export const RecoveryQueued = recoveryScenario({
  page: recoveryPage,
  command: { commandId: "sample", state: "queued", outcomes: [] },
});

export const RecoveryCompleted = recoveryScenario({
  page: recoveryPage,
  command: {
    commandId: "sample",
    state: "completed",
    outcomes: (["queued", "unchanged", "recovered", "failed", "skipped"] as const).map(
      (status, i) => ({ caseToken: `case-${i}`, status, code: null }),
    ),
  },
});

export const RecoveryTriageError = recoveryScenario({
  page: recoveryPage,
  triageError: "Triage could not be saved.",
});

export const RecoveryPreview = recoveryScenario({
  page: recoveryPage,
  initialDialogOpen: true,
  preview: recoveryPreview,
  now: Date.parse("2026-11-01T00:00:00Z"),
});

export const RecoveryStepUp = recoveryScenario({
  page: recoveryPage,
  initialDialogOpen: true,
  preview: recoveryPreview,
  twoFactorEnabled: false,
  now: Date.parse("2026-11-01T00:00:00Z"),
});

export const RecoveryBatchError = recoveryScenario({
  page: recoveryPage,
  initialDialogOpen: true,
  preview: recoveryPreview,
  batchError: "Recovery could not be started.",
  now: Date.parse("2026-11-01T00:00:00Z"),
});

export const RecoveryBatchPending = recoveryScenario({
  page: recoveryPage,
  initialDialogOpen: true,
  preview: recoveryPreview,
  onConfirm: () => new Promise<boolean>(() => {}),
  now: Date.parse("2026-11-01T00:00:00Z"),
});

export const RecoveryFilters = recoveryScenario({ onFilterChange: () => {} });

export const RecoveryRunning = recoveryScenario({
  command: { commandId: "sample", state: "running", outcomes: [] },
});

export const RecoveryFailed = recoveryScenario({
  command: { commandId: "sample", state: "failed", outcomes: [] },
});

export const RecoveryClosedUnknown = recoveryScenario({
  page: { ...recovery.page, rows: [{ ...recovery.page.rows[0], closedUnknown: true }] },
});

export const RecoveryWaiting = recoveryScenario({
  page: {
    ...recovery.page,
    rows: [
      {
        ...recovery.page.rows[0],
        triage: {
          ...recovery.page.rows[0].triage,
          status: "waiting_evidence",
          snoozedUntil: "2026-12-01T12:00:00Z",
        },
      },
    ],
  },
});

export const overviewParityDashboard = {
  ...baseData,
  worker: {
    ...baseData.worker,
    bundledMigration: "20261002120000_bundled",
    appliedMigration: "20260901120000_applied",
    schemaComparison: "worker-behind" as const,
  },
  providerHealth: [
    {
      provider: "Source B",
      ok: 80,
      stale: 11,
      failed: 7,
      notRun: 3,
      p95AgeMs: 7_200_000,
      failureRatePercent: 10,
    },
  ],
  stats: { ...baseData.stats, users: 13, projects: 27, keywords: 41 },
  presence: { deferred: 17, affectedProjects: 3, occurredAt: "2026-07-17T10:30:00Z" },
  ops: {
    ...baseData.ops,
    undeliveredCount: 2,
    events: [
      {
        kind: "worker_started",
        severity: "info",
        attempts: 1,
        createdAt: "2026-07-17T12:00:00Z",
        deliveredAt: "2026-07-17T12:01:00Z",
      },
      {
        kind: "budget_exhausted",
        severity: "warning",
        attempts: 2,
        createdAt: "2026-07-17T10:30:00Z",
        deliveredAt: null,
      },
    ],
  },
};

export const emailAllowance = requireFixture(sampleData.emailAllowance);

export const parityAllowance = {
  ...emailAllowance.allowance,
  categories: [
    { category: "bulk" as const, limit: 1000, reservedAttempts: 950, remaining: 50 },
    { category: "transactional" as const, limit: 1000, reservedAttempts: 0, remaining: 1000 },
  ],
};
