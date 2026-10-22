import "server-only";
import { legacyMarketLocationSelection } from "@/lib/api/legacy-market-input";
import { hostDefinitionAdapter } from "@/lib/measurement-definitions/host-adapters";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import type { DefaultsRequest } from "@/lib/settings/reviewed-defaults-contract";
import type { SettingsHostTransaction } from "./contracts";
import { describeDefaultMarket } from "./defaults-location";
import { SettingsHostError } from "./errors";
import type { SettingsSource } from "./source";

export async function prepareDefaultsDraft(
  tx: SettingsHostTransaction,
  source: SettingsSource,
  request: DefaultsRequest,
) {
  const values = request.values;
  const current = projectDefaultSerpMarket(
    source.defaults,
    source.targets.map((row) => ({
      device: row.target.device,
      location: row.target.keywordLocation,
      locationRef: row.target.location,
    })),
  );
  const changesMarket =
    request.kind === "form" ||
    values.country !== undefined ||
    values.device !== undefined ||
    values.city !== undefined ||
    values.locationKey !== undefined;
  const country = values.country ?? current.country;
  const device = values.device ?? current.device;
  const described = await describeDefaultMarket(tx, {
    projectId: source.project.id,
    country,
    device,
    ...(changesMarket
      ? values.locationKey
        ? { locationKey: values.locationKey }
        : { selection: legacyMarketLocationSelection({ city: values.city, country }) }
      : current.locationKey
        ? { locationKey: current.locationKey }
        : { city: current.city }),
  });
  const draft = projectDefaultsSchema.parse({
    ...values,
    // Recurrence is configured only through named schedules; legacy cadence input is inert.
    frequency: source.defaults?.frequency ?? "manual",
    cronExpression: source.defaults?.cronExpression ?? null,
    timezone: source.defaults?.timezone ?? "UTC",
    jitterMinutes: source.defaults?.jitterMinutes ?? 0,
    projectId: source.project.publicId,
    ...described.market,
    serpDepth: values.serpDepth ?? source.defaults?.serpDepth ?? 100,
    serpStopOnMatch: values.serpStopOnMatch ?? source.defaults?.serpStopOnMatch ?? true,
  });
  // Every currently runnable fallback must support future inherited depth. No new provider is chosen.
  if (
    source.chain.some(
      (row) => !hostDefinitionAdapter(row.provider)?.capability.depths.includes(draft.serpDepth),
    )
  )
    throw new SettingsHostError("unsupported_capability");
  const inheritedDepthTargets = source.targets.filter(
    (row) =>
      row.policy.checkSchedule?.serpDepth == null && row.policy.keywordSchedule?.serpDepth == null,
  ).length;
  const before = source.defaults;
  return {
    draft,
    described,
    persistMarket: changesMarket,
    responseMarket: changesMarket ? { ...described.market, source: "explicit" as const } : current,
    impact: {
      existingTargetRetargets: 0 as const,
      newTargets: 0 as const,
      inheritedDepthTargets,
      recurringEstimate:
        inheritedDepthTargets === 0 || draft.serpDepth === before?.serpDepth
          ? ("unchanged" as const)
          : ("unknown" as const),
      scopeChanged:
        changesMarket &&
        (draft.locationKey !== before?.locationKey || draft.device !== before?.device),
      cadenceChanged: false,
    },
  };
}
