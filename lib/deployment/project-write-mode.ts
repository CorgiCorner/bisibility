export const PROJECT_WRITE_MODE_ACTIVE = "active";
export const PROJECT_WRITE_MODE_MIGRATION_HOLD = "migration_hold";
export const PROJECT_WRITE_MODE_MIGRATED = "migrated";

export type ProjectWriteMode =
  | typeof PROJECT_WRITE_MODE_ACTIVE
  | typeof PROJECT_WRITE_MODE_MIGRATION_HOLD
  | typeof PROJECT_WRITE_MODE_MIGRATED;

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
