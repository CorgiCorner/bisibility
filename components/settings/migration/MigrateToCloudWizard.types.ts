import type {
  createCloudMigrationHandoff,
  getCloudMigrationCompatibility,
  preflightMigrationTarget,
} from "@/lib/actions/cloud";
import type { MigrationImportCompletion } from "@/lib/migration/result";
import type { UseFormReturn } from "react-hook-form";

export type MigrationDirection = "to-cloud" | "to-self-host";
export type MigrationMode = "push" | "download";

export type MigrationTokenForm = {
  targetOrigin: string;
  token: string;
};

export type MigrationTokenFormApi = UseFormReturn<MigrationTokenForm>;
export type CloudMigrationCompatibility = Awaited<
  ReturnType<typeof getCloudMigrationCompatibility>
>;
export type CloudMigrationHandoff = Exclude<
  Awaited<ReturnType<typeof createCloudMigrationHandoff>>,
  { ok: false }
>;
export type MigrationTargetPreflight = Exclude<
  Awaited<ReturnType<typeof preflightMigrationTarget>>,
  { ok: false }
>;

export type MigrationBlocker = {
  code: string;
  message: string;
};

export type MigrationCompatibilityResult = {
  blockers: MigrationBlocker[];
  checkedAt: string;
  compatible: boolean;
  contextKey: string;
  source: CloudMigrationCompatibility;
  target: MigrationTargetPreflight;
};

export type MigrationOutcome =
  | { completion: MigrationImportCompletion; kind: "completed" }
  | { kind: "external-pending" };
