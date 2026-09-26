import { parsePublicId } from "@/lib/db/public-id";
import { centsToDollars } from "@/lib/format/currency";
import { providerIcon } from "@/lib/integrations/provider-icon";
import type { ProviderIconName } from "@/lib/integrations/types";
import { PROVIDER_USAGE_LABELS } from "@/lib/provider-rates/catalog";
import {
  type ProviderRateContextMap,
  providerRateContextKey,
} from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import {
  PROVIDER_CATALOG,
  type ProviderTint,
  serpProviderCapabilities,
  tintFor,
} from "@/lib/providers/registry";
import type { ProviderKind } from "@/lib/providers/types";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import {
  aggregateObservedUsageForProvider,
  type ObservedProviderCheckCost,
} from "@/lib/rank-check/observed-usage";
import { primaryProviderConnection } from "@/lib/rank-check/provider-chain-order";
import type { SerpDepth } from "@/lib/serp/constants";
import type {
  ProviderAvailabilityData,
  ProviderConnectionUsageData,
  ProviderUsageFeature,
  ProviderUsageStat,
} from "@/lib/settings/options";
import type { StatusKind } from "@/lib/ui/status-kind";

export type SettingsProviderSummary = {
  detail: string;
  icon: ProviderIconName;
  logoDomain?: string;
  name: string;
  primary?: boolean;
  status: StatusKind;
  tint: ProviderTint;
};

type ProviderConnectionSummary = {
  enabled: boolean;
  id: string;
  kind: ProviderKind;
  priority: number;
  provider: string;
  status: StatusKind;
};

function providerDetail(
  connection: ProviderConnectionSummary,
  checks: readonly ObservedProviderCheckCost[],
) {
  if (connection.kind !== "serp") return "Connected data source";
  const observedCost = aggregateObservedUsageForProvider(
    checks,
    connection.provider,
  ).averageCostCents;
  return observedCost !== null && observedCost > 0
    ? `SERP rank data - $${centsToDollars(observedCost).toFixed(4)} / check`
    : "SERP rank data - Provider-billed";
}

export function settingsProviderSummaries(
  connections: readonly ProviderConnectionSummary[],
  checks: readonly ObservedProviderCheckCost[],
): SettingsProviderSummary[] {
  return connections.map((connection) => {
    const provider = PROVIDER_CATALOG.find((entry) => entry.id === connection.provider);
    const primary = primaryProviderConnection(connections, connection.kind);
    return {
      detail: providerDetail(connection, checks),
      icon: providerIcon(connection.provider, connection.kind),
      logoDomain: provider?.logoDomain,
      name: provider?.label ?? connection.provider,
      primary: connection.id === primary?.id || undefined,
      status: connection.status,
      tint: tintFor(connection.provider),
    };
  });
}

type ConnectionUsageInput = {
  costPerCheckCents: number | { toString(): string } | null;
  enabled: boolean;
  id: string;
  publicId: string | null;
  kind: ProviderKind;
  priority: number;
  provider: string;
  status: StatusKind;
};

type ConnectionSourceUsageInput = {
  connectionId: string;
  /** Settled ("recorded") request rows. */
  count: number;
  costCents: number;
  feature: string;
  /** Confirmed native quantity sum; null when nothing was measured. */
  quantity: number | null;
  /** Confirmed scheduled request rows. */
  scheduled: number;
  source: ProviderRequestSource | "unknown";
  /** Recorded rows without a measured quantity (unconfirmed for quota units). */
  unmeasuredCount: number;
  /** Rows whose measurement has not settled. */
  unrecordedCount: number;
};

type RecordedProviderCheckCost = ObservedProviderCheckCost & {
  estimatedCostCents: number | { toString(): string } | null | undefined;
  status: string;
};

function requiredConnectionPublicId(value: string | null) {
  if (parsePublicId(value ?? "")?.prefix !== "conn") {
    throw new Error("Provider connection public ID is not available.");
  }
  return value as string;
}

/** Logical completed rank checks this month, kept separate from ledger usage. */
function connectionCheckCount(
  connection: ConnectionUsageInput,
  checks: readonly RecordedProviderCheckCost[],
  primaryConnectionId: string | null,
) {
  return checks.filter(
    (check) =>
      (check.provider === connection.provider ||
        (check.provider === "primary" && connection.id === primaryConnectionId)) &&
      check.status === "completed",
  ).length;
}

function connectionCostPerCheck(
  connection: ConnectionUsageInput,
  observedAverageCents: number | null,
  serpDepth: SerpDepth,
  rateContexts: ProviderRateContextMap,
) {
  const rateCents = estimatedRankCheckCostCents(
    connection.provider,
    serpDepth,
    connection.costPerCheckCents,
    rateContexts.get(providerRateContextKey(connection.id, "rank_check")) ??
      LIST_PROVIDER_RATE_CONTEXT,
  );
  if (rateCents !== null) return `$${centsToDollars(rateCents).toFixed(4)}`;
  return observedAverageCents !== null && observedAverageCents > 0
    ? `$${centsToDollars(observedAverageCents).toFixed(4)}`
    : "-";
}

const FEATURE_ORDER = [
  "rank_check",
  "keyword_research",
  "keyword_metrics",
  "ranked_keywords",
  "backlinks",
  "domain_overview",
] as const satisfies readonly ProviderUsageFeature[];

function supportedFeatures(providerId: string): readonly ProviderUsageFeature[] {
  const capabilities = serpProviderCapabilities(providerId);
  if (!capabilities) return [];
  return FEATURE_ORDER.filter((feature) => {
    if (feature === "rank_check") return capabilities.rankCheck;
    if (feature === "keyword_research") return capabilities.keywordResearch;
    if (feature === "keyword_metrics") return capabilities.keywordMetrics;
    if (feature === "ranked_keywords") return capabilities.rankedKeywords;
    if (feature === "backlinks") return capabilities.backlinks;
    return capabilities.domainOverview;
  });
}

function connectionUnit(connection: ConnectionUsageInput): "cents" | "units" {
  const allocation = PROVIDER_CATALOG.find((entry) => entry.id === connection.provider)?.allocation;
  return allocation?.kind === "billable" ? allocation.allocationUnit : "cents";
}

/**
 * Feature usage comes from the confirmed ledger only: settled cost cents and
 * measured native quantity. Unsettled and unmeasured rows are surfaced as
 * unconfirmedCount so quota views never present a partial sum as complete.
 * Nothing is derived from depth or from configured manual pricing.
 */
function ledgerFeatureStat(
  connection: ConnectionUsageInput,
  feature: ProviderUsageFeature,
  sourceUsage: readonly ConnectionSourceUsageInput[],
  checksCount?: number,
): ProviderUsageStat {
  const rows = sourceUsage.filter(
    (row) => row.connectionId === connection.id && row.feature === feature,
  );
  const unit = connectionUnit(connection);
  const measured = rows.filter((row) => row.quantity !== null);
  return {
    ...(checksCount == null ? {} : { checksCount }),
    bySource: rows.map((row) => ({
      count: row.count,
      costCents: row.costCents,
      scheduled: row.scheduled,
      source: row.source,
    })),
    costCents: rows.reduce((total, row) => total + row.costCents, 0),
    count: rows.reduce((total, row) => total + row.count, 0),
    feature,
    label: PROVIDER_USAGE_LABELS[feature],
    quantity: measured.length
      ? measured.reduce((total, row) => total + (row.quantity ?? 0), 0)
      : null,
    unconfirmedCount: rows.reduce(
      (total, row) => total + row.unrecordedCount + (unit === "units" ? row.unmeasuredCount : 0),
      0,
    ),
  };
}

function connectionFeatures(
  connection: ConnectionUsageInput,
  checks: readonly RecordedProviderCheckCost[],
  primaryConnectionId: string | null,
  sourceUsage: readonly ConnectionSourceUsageInput[],
): ProviderUsageStat[] {
  return supportedFeatures(connection.provider).map((feature) =>
    feature === "rank_check"
      ? ledgerFeatureStat(
          connection,
          feature,
          sourceUsage,
          connectionCheckCount(connection, checks, primaryConnectionId),
        )
      : ledgerFeatureStat(connection, feature, sourceUsage),
  );
}

export function settingsConnectionUsage(
  connections: readonly ConnectionUsageInput[],
  checks: readonly RecordedProviderCheckCost[],
  serpDepth: SerpDepth,
  rateContexts: ProviderRateContextMap,
  availability: ReadonlyMap<string, ProviderAvailabilityData | null> = new Map(),
  sourceUsage: readonly ConnectionSourceUsageInput[] = [],
): ProviderConnectionUsageData[] {
  const primaryConnectionId = primaryProviderConnection(connections, "serp")?.id ?? null;
  return connections
    .filter((connection) => connection.kind === "serp")
    .map((connection) => {
      const observed = aggregateObservedUsageForProvider(checks, connection.provider);
      const availableAtProvider = availability.get(connection.id);
      return {
        ...(availableAtProvider == null ? {} : { availableAtProvider }),
        connectionId: requiredConnectionPublicId(connection.publicId),
        costPerCheck: connectionCostPerCheck(
          connection,
          observed.averageCostCents,
          serpDepth,
          rateContexts,
        ),
        features: connectionFeatures(connection, checks, primaryConnectionId, sourceUsage),
        primary: connection.id === primaryConnectionId,
        provider:
          PROVIDER_CATALOG.find((entry) => entry.id === connection.provider)?.label ??
          connection.provider,
        providerId: connection.provider,
      };
    });
}
