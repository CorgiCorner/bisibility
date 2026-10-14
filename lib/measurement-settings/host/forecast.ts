import "server-only";
import { sameDefinitionBytes } from "@/lib/measurement-definitions/canonical";
import { hostDefinitionAdapter } from "@/lib/measurement-definitions/host-adapters";
import type {
  MeasurementQuote,
  MeasurementSelection,
  ScheduleDraft,
} from "@/lib/measurement-settings/ui-contracts";
import type { NativeRankRequest } from "@/lib/provider-rates/native-rank-request";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { queuedRankCheckConfig } from "@/lib/rank-check/queued-config";
import { queuedRankCheckRoute } from "@/lib/rank-check/queued-routing";
import {
  plannerOwnsAutomaticChecks,
  rankCheckSchedulerMode,
} from "@/lib/rank-check/scheduler-mode";
import { firstSettingsSlot, settingsCadence, settingsOccurrences } from "./calendar";
import type { SettingsHostTransaction } from "./contracts";
import { SettingsHostError } from "./errors";
import { settingsNativeEstimate } from "./native-estimate";
import type { SettingsSource } from "./source";

/** Planner route is authority: queued DFS chooses project primary, not the schedule override. */
export async function settingsScheduleForecast(
  tx: SettingsHostTransaction,
  source: SettingsSource,
  selection: MeasurementSelection,
  draft: ScheduleDraft | null,
  asOf: Date,
  priceAsOf: Date,
) {
  if (!draft || !source.schedule) return null;
  const active = new Set(source.markets.map((row) => row.locationId));
  const targets = source.targets.filter(
    (row) =>
      row.policy.checkSchedule?.id === source.schedule!.id && active.has(row.target.locationId),
  );
  const schedulerMode = rankCheckSchedulerMode();
  if (!plannerOwnsAutomaticChecks(schedulerMode))
    return {
      calendar: null,
      route: { mode: "legacy" as const, reason: "calendar_unavailable" },
      schedulerMode,
      priority: null,
      effectiveProvider: null,
      versions: [] as string[],
      targetIds: targets.map((row) => row.keywordPublicId),
    };
  const cadence = settingsCadence(source, selection, draft);
  const end = new Date(asOf.getTime() + 28 * 86_400_000);
  const occurrences = draft.enabled ? settingsOccurrences(cadence, asOf, end) : [];
  const route = await queuedRankCheckRoute({ projectId: source.project.id }, tx);
  const priority = route.mode === "queued" ? queuedRankCheckConfig().priority : undefined;
  const chain =
    route.mode === "deferred"
      ? []
      : await loadSerpProviderChain(
          source.project.id,
          route.mode === "queued" ? undefined : selection.providerId,
          tx,
        );
  const connection = chain[0];
  if (connection) {
    const adapter = hostDefinitionAdapter(connection.provider);
    const configured = source.policy.config?.adapters.find(
      (row) => row.providerId === connection.provider,
    );
    if (
      !adapter ||
      !configured ||
      !sameDefinitionBytes(adapter.policy, configured) ||
      targets.some(
        (row) =>
          !adapter.capability.devices.includes(row.target.device) ||
          !adapter.capability.locationKinds.includes(row.target.location.kind),
      ) ||
      !adapter.capability.depths.includes(selection.depth)
    )
      throw new SettingsHostError("unsupported_capability");
  }
  const requests = targets.map((row) => ({
    keyword: row.target.text,
    depth: selection.depth,
    ...(priority ? { priority } : {}),
  })) as NativeRankRequest[];
  const native = connection
    ? await settingsNativeEstimate(tx, connection, requests, priceAsOf)
    : null;
  const recurring = native
    ? {
        ...native.estimate,
        quantity:
          native.estimate.quantity === null
            ? null
            : multiplyExact(native.estimate.quantity, occurrences.length),
        unknownTargets: native.estimate.unknownTargets * occurrences.length,
      }
    : {
        providerId: route.mode === "queued" ? "dataforseo" : selection.providerId,
        unit: hostDefinitionAdapter(selection.providerId)?.capability.nativeBillingUnit ?? "cents",
        quantity: null,
        unknownTargets: targets.length * occurrences.length,
        certainty: "unknown" as const,
      };
  const calendar: NonNullable<MeasurementQuote["calendar"]> = {
    windowStart: asOf.toISOString(),
    windowEnd: end.toISOString(),
    timezone: cadence.timezone,
    dueOccurrences: occurrences.length,
    nextRunAt: firstSettingsSlot(
      occurrences,
      cadence,
      targets.map((row) => row.keywordId),
      asOf,
    ),
    recurringEstimates: [recurring],
    targetScope: {
      keywordCount: new Set(targets.map((row) => row.target.text)).size,
      targetCount: targets.length,
      locationCount: new Set(targets.map((row) => row.target.locationId)).size,
      languageCount: new Set(targets.map((row) => row.target.location.languageCode)).size,
      deviceCount: new Set(targets.map((row) => row.target.device)).size,
    },
  };
  return {
    calendar,
    route,
    schedulerMode,
    priority: priority ?? null,
    effectiveProvider: connection?.provider ?? null,
    versions: native?.versions ?? [],
    targetIds: targets.map((row) => row.keywordPublicId),
  };
}
export function multiplyExact(text: string, count: number) {
  if (!/^\d+(?:\.\d+)?$/u.test(text) || !Number.isSafeInteger(count) || count < 0)
    throw new SettingsHostError("source_unavailable");
  const [integer, fraction = ""] = text.split(".");
  const product = (BigInt(integer + fraction) * BigInt(count))
    .toString()
    .padStart(fraction.length + 1, "0");
  return fraction.length
    ? `${product.slice(0, -fraction.length)}.${product.slice(-fraction.length)}`
    : product;
}
