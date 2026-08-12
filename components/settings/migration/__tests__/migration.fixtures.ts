import type {
  CloudMigrationCompatibility,
  MigrationTargetPreflight,
} from "@/components/settings/migration/MigrateToCloudWizard.types";
import type {
  exportCloudImportPackage,
  preflightMigrationTarget,
  transferCloudImportPackage,
} from "@/lib/actions/cloud";
import type { planChunkedTransfer } from "@/lib/actions/instance-migration";

export type MigrationCompatibilityPayload = CloudMigrationCompatibility;
export type MigrationPreflightPayload = MigrationTargetPreflight;
export type MigrationPreflightFailurePayload = Extract<
  Awaited<ReturnType<typeof preflightMigrationTarget>>,
  { ok: false }
>;
export type MigrationTransferResult = Extract<
  Awaited<ReturnType<typeof transferCloudImportPackage>>,
  { ok: true }
>;
export type MigrationPlanPayload = Awaited<ReturnType<typeof planChunkedTransfer>>;
export type MigrationPackageFile = Awaited<ReturnType<typeof exportCloudImportPackage>>;

export const defaultPublicProjectId = "prj_abcdefghijklmnopqrstuvwx";
export const defaultPublicJobId = "imp_abcdefghijklmnopqrstuvwx";
export const retryPublicJobId = "imp_zbcdefghijklmnopqrstuvwx";

export function makeCompatibilityPayload(
  overrides: Partial<MigrationCompatibilityPayload> = {},
): MigrationCompatibilityPayload {
  return {
    appVersion: "1.2.3",
    appVersionSource: "package.json",
    cloudOrigin: "https://migration.example.com",
    data: { keywords: 1, rankChecks: 2 },
    limits: { pushMaxKeywords: 500, sessionsRequired: false },
    schema: { count: 12, latest: "20260708010000_source" },
    ...overrides,
  };
}

export function makeOverLimitCompatibilityPayload(): MigrationCompatibilityPayload {
  return makeCompatibilityPayload({
    data: { keywords: 401, rankChecks: 25_001 },
    limits: { pushMaxKeywords: 500, sessionsRequired: true },
  });
}

export function makePreflightPayload(
  overrides: Partial<MigrationPreflightPayload> = {},
): MigrationPreflightPayload {
  return {
    appVersion: "1.2.3",
    latestMigration: "20260708010000_target",
    origin: "https://migration.example.com",
    reachable: true,
    sameInstance: false,
    schemaVersionsSupported: [5],
    sourceDeploymentMode: "self-host",
    supportsSessions: true,
    ...overrides,
  };
}

export function makePreflightFailurePayload(message: string): MigrationPreflightFailurePayload {
  return {
    error: { code: "invalid_migration_target", message, status: 400 },
    ok: false,
  };
}

export function makeUnsupportedPreflightPayload(): MigrationPreflightPayload {
  return makePreflightPayload({
    appVersion: "1.0.0",
    latestMigration: null,
    schemaVersionsSupported: null,
    supportsSessions: false,
  });
}

export function makeLegacyPreflightPayload(): MigrationPreflightPayload {
  return makePreflightPayload({
    appVersion: "1.0.0",
    latestMigration: "legacy",
    schemaVersionsSupported: [1],
    supportsSessions: false,
  });
}

export function makeBlockedSessionsPreflightPayload(): MigrationPreflightPayload {
  return makePreflightPayload({
    appVersion: "1.0.0",
    latestMigration: null,
    reason: "Target instance is too old for chunked sessions - upgrade it.",
    schemaVersionsSupported: [1, 2],
    supportsSessions: false,
  });
}

export function makeTransferResult(
  overrides: Partial<MigrationTransferResult["value"]> = {},
): MigrationTransferResult {
  return {
    ok: true,
    value: {
      counts: { history: 2, keywords: 1 },
      jobId: defaultPublicJobId,
      state: "done",
      ...overrides,
    },
  };
}

export function makePlanPayload(
  overrides: Partial<MigrationPlanPayload> = {},
): MigrationPlanPayload {
  return {
    chunkCount: 2,
    totalKeywords: 1,
    totalRankChecks: 2,
    useSessions: false,
    ...overrides,
  };
}

export const defaultPackageFile: MigrationPackageFile = {
  content: JSON.stringify({ keywords: [{ text: "rank tracker" }], rank_checks: [] }),
  counts: {
    alertRules: 0,
    competitors: 0,
    keywords: 1,
    notificationPreferences: 0,
    rankChecks: 0,
    savedViews: 0,
  },
  filename: "bisibility-cloud-import.json",
  mimeType: "application/json",
};
