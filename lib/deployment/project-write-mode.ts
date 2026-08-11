export const PROJECT_WRITE_MODE_ACTIVE = "active";
export const PROJECT_WRITE_MODE_MIGRATION_HOLD = "migration_hold";
export const PROJECT_WRITE_MODE_MIGRATED = "migrated";

export type ProjectWriteMode =
  | typeof PROJECT_WRITE_MODE_ACTIVE
  | typeof PROJECT_WRITE_MODE_MIGRATION_HOLD
  | typeof PROJECT_WRITE_MODE_MIGRATED;

export const DEFAULT_MIGRATION_HOLD_TTL_HOURS = 24;

export type SelfHostMigrationState = {
  /** TTL eligibility boundary. The hourly release sweep follows shortly after it. */
  autoReleasesAt: string | null;
  canRollback: boolean;
  startedAt: string | null;
  writeMode: ProjectWriteMode;
};

const lockedMessage =
  "Project is in read-only mode while migration hold is active. Release the migration hold before writing to this project.";

export class ProjectReadOnlyError extends Error {
  readonly code = "project_read_only";
  readonly status = 423;

  constructor(readonly projectId?: string | null) {
    super(lockedMessage);
    this.name = "ProjectReadOnlyError";
  }
}

export function normalizeProjectWriteMode(value: unknown): ProjectWriteMode {
  if (value === PROJECT_WRITE_MODE_MIGRATION_HOLD) return PROJECT_WRITE_MODE_MIGRATION_HOLD;
  if (value === PROJECT_WRITE_MODE_MIGRATED) return PROJECT_WRITE_MODE_MIGRATED;
  return PROJECT_WRITE_MODE_ACTIVE;
}

export function isProjectReadOnly(value: unknown) {
  return normalizeProjectWriteMode(value) !== PROJECT_WRITE_MODE_ACTIVE;
}

export function assertProjectWritable(input?: { id?: string | null; writeMode?: unknown } | null) {
  if (input && isProjectReadOnly(input.writeMode)) {
    throw new ProjectReadOnlyError(input.id);
  }
}

export function assertProjectAcceptsMigration(
  input?: { id?: string | null; writeMode?: unknown } | null,
) {
  if (input && normalizeProjectWriteMode(input.writeMode) === PROJECT_WRITE_MODE_MIGRATED) {
    throw new ProjectReadOnlyError(input.id);
  }
}

export function migrationHoldTtlHours(input?: number, configuredValue?: string) {
  const configured = Number.parseInt(configuredValue ?? "", 10);
  const configuredTtl =
    Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MIGRATION_HOLD_TTL_HOURS;
  const ttlHours = input ?? configuredTtl;
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error("ttlHours must be a positive finite number.");
  }
  return ttlHours;
}

export function selfHostMigrationState(
  input: { writeMode: ProjectWriteMode; writeModeChangedAt: Date | null },
  ttlHours: number,
): SelfHostMigrationState {
  if (input.writeMode !== PROJECT_WRITE_MODE_MIGRATION_HOLD) {
    return {
      autoReleasesAt: null,
      canRollback: false,
      startedAt: null,
      writeMode: input.writeMode,
    };
  }

  const startedAt = input.writeModeChangedAt;
  return {
    autoReleasesAt: startedAt
      ? new Date(startedAt.getTime() + ttlHours * 60 * 60_000).toISOString()
      : null,
    canRollback: true,
    startedAt: startedAt?.toISOString() ?? null,
    writeMode: input.writeMode,
  };
}
