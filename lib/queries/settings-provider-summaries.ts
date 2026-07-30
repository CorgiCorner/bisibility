import { parsePublicId } from "@/lib/db/public-id";
import { centsToDollars } from "@/lib/format/currency";
import { providerIcon } from "@/lib/integrations/provider-icon";
import type { ProviderIconName } from "@/lib/integrations/types";
import {
  type ProviderRateContextMap,
  providerRateContextKey,
} from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import {
  getSerpProvider,
  PROVIDER_CATALOG,
  type ProviderTint,
  tintFor,
} from "@/lib/providers/registry";
import type { ProviderKind } from "@/lib/providers/types";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import {
  aggregateObservedUsageForProvider,
  type ObservedProviderCheckCost,
} from "@/lib/rank-check/observed-usage";
import { primaryProviderConnection } from "@/lib/rank-check/provider-chain-order";
import type { SerpDepth } from "@/lib/serp/markets";
import type { ProviderConnectionUsageData } from "@/lib/settings/options";
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

type ConnectionLookupSpendInput = {
  connectionId: string;
  costCents: number;
  entryCount: number;
};

type RecordedProviderCheckCost = ObservedProviderCheckCost & {
  estimatedCostCents: number | { toString(): string } | null | undefined;
  status: string;
};

function recordedCostCents(check: RecordedProviderCheckCost) {
  // Runner output keeps a positive actual cost and its fallback estimate mutually exclusive.
  const actual = Number(check.costCents ?? 0);
  const estimated = Number(check.estimatedCostCents ?? 0);
  return (Number.isFinite(actual) ? actual : 0) + (Number.isFinite(estimated) ? estimated : 0);
}

function requiredConnectionPublicId(value: string | null) {
  if (parsePublicId(value ?? "")?.prefix !== "conn") {
    throw new Error("Provider connection public ID is not available.");
  }
  return value as string;
}

function connectionRankChecks(
  connection: ConnectionUsageInput,
  checks: readonly RecordedProviderCheckCost[],
  primaryConnectionId: string | null,
) {
  const attributed = checks.filter(
    (check) =>
      check.provider === connection.provider ||
      (check.provider === "primary" && connection.id === primaryConnectionId),
  );
  return {
    costCents: Number(
      attributed.reduce((total, check) => total + recordedCostCents(check), 0).toFixed(6),
    ),
    count: attributed.filter((check) => check.status === "completed").length,
  };
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

// Whether the provider can serve keyword research at all; unsupported providers
// render "not supported" instead of a zero lookup count (HANDOFF-35 section 4).
function supportsKeywordLookups(providerId: string) {
  try {
    const provider = getSerpProvider(providerId);
    return (
      typeof provider.fetchRelatedKeywords === "function" ||
      typeof provider.fetchKeywordSuggestions === "function" ||
      typeof provider.fetchKeywordIdeas === "function"
    );
  } catch {
    return false;
  }
}

export function settingsConnectionUsage(
  connections: readonly ConnectionUsageInput[],
  checks: readonly RecordedProviderCheckCost[],
  lookups: readonly ConnectionLookupSpendInput[],
  serpDepth: SerpDepth,
  rateContexts: ProviderRateContextMap,
): ProviderConnectionUsageData[] {
  const primaryConnectionId = primaryProviderConnection(connections, "serp")?.id ?? null;
  return connections
    .filter((connection) => connection.kind === "serp")
    .map((connection) => {
      const observed = aggregateObservedUsageForProvider(checks, connection.provider);
      const connectionLookups = lookups.filter((row) => row.connectionId === connection.id);
      const lookupCostCents = connectionLookups.reduce((total, row) => total + row.costCents, 0);
      const lookupCount = connectionLookups.reduce((total, row) => total + row.entryCount, 0);
      return {
        connectionId: requiredConnectionPublicId(connection.publicId),
        costPerCheck: connectionCostPerCheck(
          connection,
          observed.averageCostCents,
          serpDepth,
          rateContexts,
        ),
        lookups: supportsKeywordLookups(connection.provider)
          ? { costCents: lookupCostCents, count: lookupCount }
          : null,
        primary: connection.id === primaryConnectionId,
        provider:
          PROVIDER_CATALOG.find((entry) => entry.id === connection.provider)?.label ??
          connection.provider,
        rankChecks: connectionRankChecks(connection, checks, primaryConnectionId),
      };
    });
}
