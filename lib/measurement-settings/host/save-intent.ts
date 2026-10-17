import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { definitionProjectScope } from "@/lib/measurement-definitions/access";
import { hostDefinitionAdapter } from "@/lib/measurement-definitions/host-adapters";
import type {
  SettingsIntentCommand,
  SettingsSnapshot,
} from "@/lib/measurement-settings/ui-contracts";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import type { SerpDepth } from "@/lib/serp/constants";
import { countrySeed } from "@/lib/serp/location";
import { updateProjectDefaultsInTransaction } from "@/lib/settings/project-defaults-service";
import type { SettingsHostContext } from "./contracts";
import { verifyDefaultsWritePermit } from "./defaults-permit";
import { SettingsHostError } from "./errors";
import { settingsIntentEffect } from "./intent-effect";
import { assertSettingsSnapshot } from "./preview";
import { settingsSnapshot } from "./projection";
import { readSettingsMutation, settingsMutationScope, writeSettingsMutation } from "./receipts";
import { hostIntentSchema } from "./schema";
import { loadSettingsSource } from "./source";

export function saveMeasurementIntentHost(
  context: SettingsHostContext,
  input: SettingsIntentCommand,
  database: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<SettingsSnapshot> {
  const data = hostIntentSchema.parse(input);
  return database.$transaction(
    async (tx) => {
      const project = await definitionProjectScope(
        tx,
        context,
        data.projectId,
        "update",
        "project_defaults",
      );
      const scope = settingsMutationScope(
        project.id,
        context.actor.id,
        "measurement_settings.intent",
        data,
      );
      const replay = await readSettingsMutation(tx, scope);
      if (replay) return replay;
      const source = await loadSettingsSource(tx, context, data.projectId, data.scheduleId);
      assertSettingsSnapshot(source, data);
      const defaults = source.defaults;
      const geo = source.markets.find(
        (row) => row.location.canonicalKey === data.selection.geoId,
      )?.location;
      if (
        !defaults ||
        !geo ||
        geo.languageCode !== data.selection.languageCode ||
        !["desktop", "mobile"].includes(data.selection.device)
      )
        throw new SettingsHostError("invalid_settings");
      // Project-default depth must be supported by every currently configured runnable provider.
      if (
        !source.chain.length ||
        source.chain.some(
          (connection) =>
            !source.policy.config?.adapters.some((row) => row.providerId === connection.provider) ||
            !hostDefinitionAdapter(connection.provider)?.capability.depths.includes(
              data.selection.depth,
            ),
        )
      )
        throw new SettingsHostError("unsupported_capability");
      const permit = verifyDefaultsWritePermit(
        "intent",
        data.previewToken,
        {
          projectId: project.id,
          actorId: context.actor.id,
          providerId: null,
          depth: data.selection.depth as SerpDepth,
          selection: { scheduleId: data.scheduleId, selection: data.selection },
          source: {
            policyEpoch: source.policy.policyEpoch,
            sourceHash: source.sourceHash,
            selection: data.selection,
            intentEffect: settingsIntentEffect(source, data.selection),
          },
        },
        new Date(),
      );
      const country = countrySeed(geo.countryCode)?.displayName;
      if (!country) throw new SettingsHostError("invalid_settings");
      const input = projectDefaultsSchema.parse({
        projectId: project.publicId,
        locationKey: geo.canonicalKey,
        country,
        city: geo.kind === "city" ? geo.displayName : null,
        device: data.selection.device,
        serpDepth: data.selection.depth,
        serpStopOnMatch: defaults.serpStopOnMatch,
        frequency: defaults.frequency,
        cronExpression: defaults.cronExpression,
        timezone: defaults.timezone,
        jitterMinutes: defaults.jitterMinutes,
      });
      await updateProjectDefaultsInTransaction(
        tx,
        context.actor.id,
        project,
        input,
        {
          country,
          city: input.city ?? null,
          device: data.selection.device,
          locationKey: geo.canonicalKey,
          locationId: geo.id,
          displayName: geo.displayName,
        },
        "settings.defaults.update",
        permit,
      );
      const result = settingsSnapshot(
        await loadSettingsSource(tx, context, data.projectId, data.scheduleId),
      );
      return writeSettingsMutation(tx, scope, context.actor.id, source.sourceHash, result);
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
