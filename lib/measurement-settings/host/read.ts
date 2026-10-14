import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { SettingsHostContext, SettingsHostRead } from "./contracts";
import { SettingsHostError } from "./errors";
import { settingsChoices, settingsPermissions, settingsSnapshot } from "./projection";
import { currentSettingsNextRun } from "./read-calendar";
import { loadSettingsSource } from "./source";

export function readMeasurementSettingsHost(
  context: SettingsHostContext,
  projectRef: string,
  scheduleRef: string | null = null,
  database: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<SettingsHostRead> {
  return database.$transaction(
    async (tx) => {
      try {
        const source = await loadSettingsSource(tx, context, projectRef, scheduleRef);
        const snapshot = settingsSnapshot(source);
        return {
          kind: "ready" as const,
          snapshot: { ...snapshot, nextRun: currentSettingsNextRun(source, snapshot, new Date()) },
          choices: settingsChoices(source),
          permissions: settingsPermissions(source),
          rateVersion: source.rateVersion,
          scheduleChoices: source.schedules.map((row) => ({ id: row.publicId, label: row.name })),
        };
      } catch (error) {
        if (
          !(error instanceof SettingsHostError) ||
          !(
            error.code === "source_unavailable" ||
            error.code === "defaults_missing" ||
            error.code === "default_geo_unavailable" ||
            error.code === "provider_missing" ||
            error.code === "provider_disabled" ||
            error.code === "provider_disconnected" ||
            error.code === "needs_reauth" ||
            error.code === "unsupported_capability" ||
            error.code === "settings_revision_unavailable" ||
            error.code === "measurement_policy_unconfigured" ||
            error.code === "measurement_policy_unsupported"
          )
        )
          throw error;
        return {
          kind: "unavailable" as const,
          reason: error.code,
          permissions: {
            canRead: true,
            canPreview: false,
            canLaunch: false,
            canWriteSchedule: false,
            canWriteIntent: false,
          },
        };
      }
    },
    { isolationLevel: "RepeatableRead" },
  );
}
