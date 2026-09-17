import type { DateDisplayContext } from "@/lib/dates/format";
import { formatDisplayDateTime } from "@/lib/dates/format";
import type { useTranslations } from "next-intl";
import type { MigrationBlocker, MigrationCompatibilityResult } from "./MigrateToCloudWizard.types";

export const MIGRATION_GUIDE_URL = "https://bisibility.com/docs/guides/migration";
export const MIGRATION_ERROR_CODES_URL = `${MIGRATION_GUIDE_URL}#compatibility-error-codes`;

export type RowTone = "fail" | "info" | "ok" | "pending";
type StatusRowBase = { detail: string; title: string; tone: RowTone };
export type StatusRowData = StatusRowBase &
  ({ status: string; variant: "status" } | { variant: "detail" });

type MigrationCheckTranslator = ReturnType<
  typeof useTranslations<"projectSettingsMigration.check">
>;

function blockerHint(
  code: string,
  target: MigrationCompatibilityResult["target"],
  t: MigrationCheckTranslator,
) {
  switch (code) {
    case "MIG-101":
      return t("blocker.MIG-101");
    case "MIG-102":
      return t("blocker.MIG-102");
    case "MIG-103":
      return t("blocker.MIG-103");
    case "MIG-104":
      return t("blocker.MIG-104");
    case "MIG-105":
      return t("blocker.MIG-105", {
        deploymentHint: target.sourceDeploymentMode === "self-host" ? "selfHost" : "none",
        origin: target.origin,
      });
    default:
      return t("blocker.default");
  }
}

function blockerTitle(code: string, t: MigrationCheckTranslator) {
  switch (code) {
    case "MIG-101":
      return t("error.MIG-101");
    case "MIG-102":
      return t("error.MIG-102");
    case "MIG-103":
      return t("error.MIG-103");
    case "MIG-104":
      return t("error.MIG-104");
    case "MIG-105":
      return t("error.MIG-105");
    default:
      return t("error.unknown", { code });
  }
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
    });
    return blockers;
  }
  if (!target.reachable) {
    blockers.push({
      code: "MIG-101",
    });
    return blockers;
  }
  if (source.limits.sessionsRequired && !target.supportsSessions) {
    blockers.push({
      code: "MIG-102",
    });
  }
  const declaredVersions = target.schemaVersionsSupported;
  if (!declaredVersions) {
    blockers.push({
      code: "MIG-103",
    });
  } else if (!declaredVersions.includes(requiredVersion)) {
    blockers.push({
      code: "MIG-104",
    });
  }
  return blockers;
}

export function pendingRows(t: MigrationCheckTranslator): StatusRowData[] {
  return [
    {
      detail: t("pending.readyDetail"),
      status: t("pending.required"),
      title: t("pending.readyTitle"),
      tone: "pending",
      variant: "status",
    },
    {
      detail: t("pending.destinationDetail"),
      status: t("pending.pending"),
      title: t("pending.destinationTitle"),
      tone: "pending",
      variant: "status",
    },
    {
      detail: t("pending.planDetail"),
      title: t("pending.planTitle"),
      tone: "pending",
      variant: "detail",
    },
  ];
}

export function resultRows(
  result: MigrationCompatibilityResult,
  dateContext: DateDisplayContext,
  t: MigrationCheckTranslator,
): StatusRowData[] {
  const { source, target } = result;
  return [
    {
      detail: result.compatible
        ? t("result.ready", {
            checkedAt: formatDisplayDateTime(new Date(result.checkedAt), dateContext),
          })
        : t("result.blocked"),
      status: result.compatible ? t("result.readyStatus") : t("result.blockedStatus"),
      title: t("pending.readyTitle"),
      tone: result.compatible ? "ok" : "fail",
      variant: "status",
    },
    ...result.blockers.map((blocker) => ({
      detail: blockerHint(blocker.code, target, t),
      status: blocker.code,
      title: blockerTitle(blocker.code, t),
      tone: "fail" as const,
      variant: "status" as const,
    })),
    {
      detail: target.reachable
        ? t("result.reachable", {
            origin: target.origin,
            version: target.appVersion ?? t("result.unknownVersion"),
          })
        : t("result.unreachable"),
      status: target.reachable ? t("result.reachableStatus") : t("result.failedStatus"),
      title: t("pending.destinationTitle"),
      tone: target.reachable ? "ok" : "fail",
      variant: "status",
    },
    {
      detail: t("result.plan", {
        chunked: source.limits.sessionsRequired ? "true" : "false",
        keywords: source.data.keywords,
        rankChecks: source.data.rankChecks,
      }),
      title: t("pending.planTitle"),
      tone: "info",
      variant: "detail",
    },
  ];
}

export function technicalDetails(
  result: MigrationCompatibilityResult,
  dateContext: DateDisplayContext,
  t: MigrationCheckTranslator,
): string[] {
  const { source, target } = result;
  const requiredVersion = 5;
  const lines = [
    t("details.source", {
      appVersion: source.appVersion,
      count: new Intl.NumberFormat(dateContext.locale).format(source.schema.count),
      latest: source.schema.latest ?? t("details.unavailable"),
    }),
    t("details.destination", {
      appVersion: target.appVersion ?? t("details.unknown"),
      latest: target.latestMigration ?? t("details.unknown"),
    }),
    t("details.protocol", {
      declared: target.schemaVersionsSupported?.join(", ") ?? t("details.none"),
      version: new Intl.NumberFormat(dateContext.locale).format(requiredVersion),
    }),
  ];
  if (target.reason) lines.push(t("details.response", { reason: target.reason }));
  return lines;
}
