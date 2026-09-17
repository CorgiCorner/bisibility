import type {
  ProviderMetaRow,
  ProviderRateData,
  ProviderStatusKind,
} from "@/lib/integrations/types";
import {
  PROVIDER_RATE_LABELS,
  PROVIDER_RATE_UNITS,
  providerDomainOverviewListRates,
  providerListRate,
  providerRateFeatures,
} from "@/lib/provider-rates/catalog";
import {
  type ProviderRateEntry,
  type ProviderRateFeature,
  type ResolvedProviderRate,
  resolveProviderRate,
} from "@/lib/provider-rates/resolver";
import { normalizeGscProperty } from "@/lib/providers/analytics/gsc-property";
import type { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderCredentials, ProviderKind } from "@/lib/providers/types";

export type ProviderConnectionRow = {
  costPerCheckCents: unknown;
  credentialsEncrypted: string | null;
  enabled: boolean;
  id: string;
  kind: ProviderKind;
  lastUsedAt: Date | null;
  priority: number;
  provider: string;
  status: ProviderStatusKind;
  updatedAt: Date;
  rates?: readonly {
    amountCents: unknown;
    feature: ProviderRateFeature;
  }[];
};

export type ProviderCostEntryRow = ProviderRateEntry & {
  connectionId: string;
  feature: ProviderRateFeature;
};

export function providerDescription(item: (typeof PROVIDER_CATALOG)[number]) {
  if (item.id === "local-sequence") {
    return "Add [seq:5,15,15,4] to choose the ranks returned for a keyword.";
  }
  return item.kind === "serp"
    ? `${item.label} rank-data provider. You pay the provider directly.`
    : `${item.label} connection for owned data enrichment.`;
}

function stateValueKey(connection: ProviderConnectionRow | undefined) {
  if (!connection) return "ready" as const;
  return connection.enabled ? ("enabled" as const) : ("disabled" as const);
}

/** A timestamp row: the viewer's locale turns it into relative time, never this module. */
function elapsedRow(
  labelKey: ProviderMetaRow["labelKey"],
  date: Date | null | undefined,
  now: Date,
): ProviderMetaRow {
  if (!date) return { labelKey, valueKey: "never" };
  return { labelKey, relativeTo: now.toISOString(), valueAt: date.toISOString() };
}

export function providerMeta(
  item: (typeof PROVIDER_CATALOG)[number],
  connection: ProviderConnectionRow | undefined,
  credentials: ProviderCredentials,
  now: Date,
): ProviderMetaRow[] {
  if (item.kind === "analytics") {
    const identityKey = item.id === "plausible" ? "siteDomain" : "property";
    return [
      credentials.login
        ? { labelKey: identityKey, value: credentials.login }
        : { labelKey: identityKey, valueKey: "notSelected" },
      ...(item.id === "plausible"
        ? [
            {
              labelKey: "apiService" as const,
              value: credentials.endpoint ?? "Plausible Cloud",
            },
          ]
        : []),
      elapsedRow("lastSync", connection?.lastUsedAt, now),
      { labelKey: "state", valueKey: stateValueKey(connection) },
    ];
  }

  return [
    ...(credentials.login ? [{ labelKey: "account" as const, value: credentials.login }] : []),
    elapsedRow("lastRankCheck", connection?.lastUsedAt, now),
    { labelKey: "state", valueKey: stateValueKey(connection) },
  ];
}

export function providerActivities(
  connection: ProviderConnectionRow | undefined,
  now: Date,
): ProviderMetaRow[] {
  return [
    elapsedRow("lastUsed", connection?.lastUsedAt, now),
    elapsedRow("connectionUpdated", connection?.updatedAt, now),
    {
      labelKey: "fallbackState",
      valueKey: connection ? (connection.enabled ? "enabled" : "disabled") : "notConnected",
    },
  ];
}

function serializedRate(
  feature: ProviderRateFeature,
  resolved: ResolvedProviderRate,
  fallback: ResolvedProviderRate,
): ProviderRateData {
  return {
    ...("amountCents" in resolved ? { amountCents: resolved.amountCents } : {}),
    ...("checkedAt" in resolved ? { checkedAt: resolved.checkedAt.toISOString() } : {}),
    ...(resolved.source === "measured" ? { sampleSize: resolved.sampleSize } : {}),
    ...(fallback.source === "measured" || fallback.source === "list"
      ? { fallbackSource: fallback.source }
      : {}),
    feature,
    label: PROVIDER_RATE_LABELS[feature],
    source: resolved.source,
    unit: PROVIDER_RATE_UNITS[feature],
  };
}

export function providerRates(
  connection: ProviderConnectionRow | undefined,
  providerId: string,
  costEntries: readonly ProviderCostEntryRow[],
): ProviderRateData[] {
  const editableRates = providerRateFeatures(providerId).map((feature) => {
    const manualRate = connection?.rates?.find((rate) => rate.feature === feature);
    const legacyRankRate =
      feature === "rank_check" && !manualRate ? connection?.costPerCheckCents : null;
    const entries = connection
      ? costEntries.filter(
          (entry) => entry.connectionId === connection.id && entry.feature === feature,
        )
      : [];
    const list = providerListRate(providerId, feature);
    const fallback = resolveProviderRate({ entries, list, manualAmountCents: null });
    const resolved = resolveProviderRate({
      entries,
      list,
      manualAmountCents: manualRate?.amountCents ?? legacyRankRate,
    });
    return serializedRate(feature, resolved, fallback);
  });
  const domainOverviewRates: ProviderRateData[] = providerDomainOverviewListRates(providerId).map(
    (rate) => ({ ...rate, checkedAt: rate.checkedAt.toISOString() }),
  );
  return [...editableRates, ...domainOverviewRates];
}

export function displayedProviderLogin(itemId: string, login: string | undefined) {
  return itemId === "gsc" && login ? normalizeGscProperty(login) : login;
}
