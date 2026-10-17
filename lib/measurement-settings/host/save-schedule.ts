import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { definitionProjectScope } from "@/lib/measurement-definitions/access";
import type {
  ScheduleIntentCommand,
  SettingsSnapshot,
} from "@/lib/measurement-settings/ui-contracts";
import { updateScheduleInTransaction } from "@/lib/rank-check/schedules/service";
import type { SerpDepth } from "@/lib/serp/constants";
import { scheduleUpdateInput } from "./calendar";
import type { SettingsHostContext } from "./contracts";
import { SettingsHostError } from "./errors";
import { settingsScheduleForecast } from "./forecast";
import { assertSettingsSnapshot } from "./preview";
import { settingsSnapshot } from "./projection";
import { settingsQuoteClock } from "./quote-binding";
import { readSettingsMutation, settingsMutationScope, writeSettingsMutation } from "./receipts";
import { verifiedReviewedConsent } from "./reviewed-consent";
import { hostScheduleSchema } from "./schema";
import { assertSettingsSelection } from "./selection";
import { loadSettingsSource } from "./source";

export function saveMeasurementScheduleHost(
  context: SettingsHostContext,
  input: ScheduleIntentCommand,
  database: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<SettingsSnapshot> {
  const data = hostScheduleSchema.parse(input);
  return database.$transaction(
    async (tx) => {
      const project = await definitionProjectScope(
        tx,
        context,
        data.projectId,
        "update",
        "check_schedule",
      );
      const scope = settingsMutationScope(
        project.id,
        context.actor.id,
        "measurement_settings.schedule",
        data,
      );
      const replay = await readSettingsMutation(tx, scope);
      if (replay) return replay;
      const source = await loadSettingsSource(tx, context, data.projectId, data.scheduleId);
      assertSettingsSnapshot(source, data);
      assertSettingsSelection(source, data.selection);
      const defaults = settingsSnapshot(source).selection;
      // Geo/language/device are not CheckSchedule fields. Require explicit defaults save first.
      if (
        data.selection.geoId !== defaults.geoId ||
        data.selection.languageCode !== defaults.languageCode ||
        data.selection.device !== defaults.device
      )
        throw new SettingsHostError("invalid_settings");
      const now = new Date();
      const asOf = settingsQuoteClock(data.previewToken, now);
      const forecast = await settingsScheduleForecast(
        tx,
        source,
        data.selection,
        data.schedule,
        asOf,
        now,
      );
      if (!forecast || (data.schedule.enabled && !forecast.calendar))
        throw new SettingsHostError("invalid_settings");
      const consent = verifiedReviewedConsent(
        "schedule",
        data.previewToken,
        {
          projectId: project.id,
          actorId: context.actor.id,
          providerId: data.selection.providerId,
          depth: data.selection.depth as SerpDepth,
          selection: {
            selection: data.selection,
            schedule: data.schedule,
            scheduleId: data.scheduleId,
          },
          source: {
            policyEpoch: source.policy.policyEpoch,
            sourceHash: source.sourceHash,
            forecast,
          },
        },
        now,
      );
      await updateScheduleInTransaction(
        tx,
        context.actor.id,
        project.id,
        scheduleUpdateInput(source, data.selection, data.schedule),
        consent,
      );
      const result = settingsSnapshot(
        await loadSettingsSource(tx, context, data.projectId, data.scheduleId),
      );
      return writeSettingsMutation(tx, scope, context.actor.id, source.sourceHash, result);
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
