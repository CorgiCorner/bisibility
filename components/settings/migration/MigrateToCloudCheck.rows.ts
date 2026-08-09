import type { MigrationBlocker, MigrationCompatibilityResult } from "./MigrateToCloudWizard.types";

export const MIGRATION_GUIDE_URL = "https://bisibility.com/docs/guides/migration";
export const MIGRATION_ERROR_CODES_URL = `${MIGRATION_GUIDE_URL}#compatibility-error-codes`;

export type RowTone = "fail" | "info" | "ok" | "pending";
type StatusRowBase = { detail: string; title: string; tone: RowTone };
export type StatusRowData = StatusRowBase &
  ({ status: string; variant: "status" } | { variant: "detail" });

function numberLabel(value: number) {
  return value.toLocaleString();
}

// Stable, documented codes shown next to each blocker. Keep in sync with
// docs/guides/migration.mdx (#compatibility-error-codes).
const BLOCKER_HINTS: Record<string, string> = {
  "MIG-101": "Check the URL is correct and the destination instance is online.",
  "MIG-102": "Update the destination to the latest version, then re-run the check.",
  "MIG-103": "Update the destination to the latest version, then re-run the check.",
  "MIG-104": "Update the destination to the latest version, then re-run the check.",
};

function blockerHint(code: string, target: MigrationCompatibilityResult["target"]) {
  if (code !== "MIG-105") {
    return BLOCKER_HINTS[code] ?? "See the migration guide for fixes.";
  }
  const deploymentHint =
    target.sourceDeploymentMode === "self-host"
      ? " If this is meant to be a hosted deployment, it likely needs DEPLOYMENT_MODE set to cloud."
      : "";
  return `Pick a different destination. The resolved address is ${target.origin}.${deploymentHint}`;
}

export function compatibilityBlockers(
  source: MigrationCompatibilityResult["source"],
  target: MigrationCompatibilityResult["target"],
): MigrationBlocker[] {
  const blockers: MigrationBlocker[] = [];
  const requiredVersion = 5;
  if (target.sameInstance) {
    blockers.push({
      code: "MIG-105",
      message: "The destination address points at this same instance.",
    });
    return blockers;
  }
  if (!target.reachable) {
    blockers.push({
      code: "MIG-101",
      message: "We couldn't reach the destination instance.",
    });
    return blockers;
  }
  if (source.limits.sessionsRequired && !target.supportsSessions) {
    blockers.push({
      code: "MIG-102",
      message: "The destination is too old to accept a project of this size.",
    });
  }
  const declaredVersions = target.schemaVersionsSupported;
  if (!declaredVersions) {
    blockers.push({
      code: "MIG-103",
      message: "The destination didn't report which import formats it supports.",
    });
  } else if (!declaredVersions.includes(requiredVersion)) {
    blockers.push({
      code: "MIG-104",
      message: "The destination doesn't support the transfer format this project needs.",
    });
  }
  return blockers;
}

export function pendingRows(): StatusRowData[] {
  return [
    {
      detail: "Run the check to confirm this project can move to the destination.",
      status: "REQUIRED",
      title: "Ready to transfer?",
      tone: "pending",
      variant: "status",
    },
    {
      detail: "No response recorded yet for this destination.",
      status: "PENDING",
      title: "Destination instance",
      tone: "pending",
      variant: "status",
    },
    {
      detail: "Keyword and history counts appear here after the check.",
      title: "Transfer plan",
      tone: "pending",
      variant: "detail",
    },
  ];
}

export function resultRows(result: MigrationCompatibilityResult): StatusRowData[] {
  const { source, target } = result;
  return [
    {
      detail: result.compatible
        ? `All checks passed (${new Date(result.checkedAt).toLocaleString()}). Continue to start the transfer.`
        : "This project can't transfer yet. Fix the issues below, then run the check again.",
      status: result.compatible ? "READY" : "BLOCKED",
      title: "Ready to transfer?",
      tone: result.compatible ? "ok" : "fail",
      variant: "status",
    },
    ...result.blockers.map((blocker) => ({
      detail: blockerHint(blocker.code, target),
      status: blocker.code,
      title: blocker.message,
      tone: "fail" as const,
      variant: "status" as const,
    })),
    {
      detail: target.reachable
        ? `Reachable - bisibility ${target.appVersion ?? "(unknown version)"} at ${target.origin}.`
        : "We couldn't reach it. Check the URL and that the instance is online.",
      status: target.reachable ? "REACHABLE" : "FAILED",
      title: "Destination instance",
      tone: target.reachable ? "ok" : "fail",
      variant: "status",
    },
    {
      detail: `${numberLabel(source.data.keywords)} keywords and ${numberLabel(source.data.rankChecks)} rank checks will move ${source.limits.sessionsRequired ? "in resumable chunks" : "in a single transfer"}.`,
      title: "Transfer plan",
      tone: "info",
      variant: "detail",
    },
  ];
}

export function technicalDetails(result: MigrationCompatibilityResult): string[] {
  const { source, target } = result;
  const requiredVersion = 5;
  const lines = [
    `Source app ${source.appVersion}; schema ${source.schema.count} applied / latest ${source.schema.latest ?? "unavailable"}`,
    `Destination app ${target.appVersion ?? "unknown"}; latest migration ${target.latestMigration ?? "unknown"}`,
    `Required import protocol v${requiredVersion}; destination declares ${target.schemaVersionsSupported?.join(", ") ?? "none"}`,
  ];
  if (target.reason) lines.push(`Destination response: ${target.reason}`);
  return lines;
}
