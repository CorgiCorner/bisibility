import "server-only";
import { hostDefinitionAdapter } from "@/lib/measurement-definitions/host-adapters";
import type { NativeEstimate } from "@/lib/measurement-settings/ui-contracts";
import { meteringNamespace } from "@/lib/metering/runtime";
import {
  loadNativeProviderQuote,
  ProviderQuoteUnavailableError,
} from "@/lib/provider-rates/native-quote";
import {
  type NativeRankRequest,
  nativeRankRequestDescriptor,
} from "@/lib/provider-rates/native-rank-request";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { addQuantity, formatQuantity } from "@usagekit/core";
import type { SettingsHostTransaction } from "./contracts";
import { SettingsHostError } from "./errors";
import type { SettingsSource } from "./source";

type Connection = SettingsSource["chain"][number];
/** Native quantities remain exact; no display amount becomes an admission or finance fact. */
export async function settingsNativeEstimate(
  tx: SettingsHostTransaction,
  connection: Connection,
  requests: readonly NativeRankRequest[],
  now: Date,
) {
  const adapter = hostDefinitionAdapter(connection.provider);
  if (!adapter) throw new SettingsHostError("unsupported_capability");
  const unit = adapter.capability.nativeBillingUnit;
  const unknown = () => ({
    estimate: {
      providerId: connection.provider,
      unit,
      quantity: null,
      unknownTargets: requests.length,
      certainty: "unknown",
    } as NativeEstimate,
    versions: [] as string[],
  });
  if (adapter.synthetic)
    return {
      estimate: {
        providerId: connection.provider,
        unit: "test",
        quantity: "0",
        unknownTargets: 0,
        certainty: "estimate",
      } as NativeEstimate,
      versions: [adapter.policy.adapterVersion],
    };
  if (requests.length === 0)
    return {
      estimate: {
        providerId: connection.provider,
        unit,
        quantity: "0",
        unknownTargets: 0,
        certainty: "estimate",
      } as NativeEstimate,
      versions: [] as string[],
    };
  // SerpApi native searches are structural units, independent of a monetary budget valuation.
  if (connection.provider === "serpapi")
    return {
      estimate: {
        providerId: connection.provider,
        unit: "searches",
        quantity: requests
          .reduce(
            (sum, row) => sum + BigInt(nativeRankRequestDescriptor(connection.provider, row).units),
            0n,
          )
          .toString(),
        unknownTargets: 0,
        certainty: "estimate",
      } as NativeEstimate,
      versions: [adapter.policy.adapterVersion],
    };
  if (connection.credentialSource !== "own" || !connection.id) return unknown();
  const current = await tx.providerConnection.findUnique({
    where: { id: connection.id },
    select: {
      projectId: true,
      project: { select: { ownerId: true } },
      enabled: true,
      status: true,
    },
  });
  const version = ownCredentialVersion(
    connection.provider,
    connection.id,
    connection.credentialsEncrypted,
  );
  if (!current || !current.enabled || current.status !== "connected" || !version) return unknown();
  const binding = {
    namespace: meteringNamespace(),
    principal: current.project.ownerId,
    projectId: current.projectId,
    connectionId: connection.id,
    provider: connection.provider,
    providerCredentialVersion: version,
    fundingSource: "byok" as const,
  };
  const quotes = new Map<string, Awaited<ReturnType<typeof loadNativeProviderQuote>> | null>();
  let total: Awaited<ReturnType<typeof loadNativeProviderQuote>>["quantities"][number] | null =
    null;
  let unknownTargets = 0;
  const versions = new Set<string>();
  for (const request of requests) {
    const { matched, units } = nativeRankRequestDescriptor(connection.provider, request);
    if (matched.operation === "unknown") {
      unknownTargets++;
      continue;
    }
    const key = JSON.stringify([
      matched.operation.id,
      Object.entries(matched.options).sort(),
      units,
    ]);
    if (!quotes.has(key)) {
      try {
        quotes.set(
          key,
          await loadNativeProviderQuote(
            tx,
            binding,
            "rank_check",
            matched.operation.id,
            matched.options,
            now,
            units,
          ),
        );
      } catch (error) {
        if (!(error instanceof ProviderQuoteUnavailableError)) throw error;
        quotes.set(key, null);
      }
    }
    const quote = quotes.get(key);
    const amount = quote?.quantities.find((row) => row.unit === "cents");
    if (!quote || !amount || !quote.priceVersion) {
      unknownTargets++;
      continue;
    }
    versions.add(quote.priceVersion);
    const quantity = { ...amount, value: amount.value * BigInt(units) };
    total = total ? addQuantity(total, quantity) : quantity;
  }
  return {
    estimate: {
      providerId: connection.provider,
      unit,
      quantity: total ? formatQuantity(total) : null,
      unknownTargets,
      certainty: total ? (unknownTargets ? "partial" : "estimate") : "unknown",
    } as NativeEstimate,
    versions: [...versions].sort(),
  };
}
