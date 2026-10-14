import "server-only";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { meteringNamespace } from "@/lib/metering/runtime";
import { nativeProviderCatalog } from "@/lib/provider-rates/catalog-source";
import { localPriceBinding } from "@/lib/provider-rates/dataforseo-finder-module";
import { mapsPriceCurrent } from "@/lib/provider-rates/dataforseo-maps-module";
import { loadNativeProviderQuote } from "@/lib/provider-rates/native-quote";
import { sumMapsNative } from "@/lib/providers/local-search/maps-native-quantity";
import { PricedRequest, type ProviderRequest } from "@usagekit/providers";
import type { MapsConnection } from "./maps-connection";

export { sumMapsNative } from "@/lib/providers/local-search/maps-native-quantity";
export async function priceMapsRequest(
  tx: LocalTransaction,
  connection: MapsConnection,
  request: ProviderRequest,
  now: Date,
) {
  if (!mapsPriceCurrent(now)) throw new Error("Maps price snapshot expired.");
  const matched = nativeProviderCatalog.match("dataforseo", request);
  const price = localPriceBinding(request);
  if (
    matched.operation === "unknown" ||
    matched.operation.id !== price.operation ||
    matched.options[price.key] !== price.version
  )
    throw new Error("Maps native descriptor did not validate the request.");
  const quote = await loadNativeProviderQuote(
    tx,
    {
      namespace: meteringNamespace(),
      principal: connection.ownerId,
      projectId: connection.projectId,
      connectionId: connection.id,
      provider: "dataforseo",
      providerCredentialVersion: connection.version,
      fundingSource: "byok",
    },
    "local_scan",
    matched.operation.id,
    matched.options,
    now,
  );
  if (!quote.priceVersion || !quote.quantities.some((q) => q.unit === "cents" && q.value > 0n))
    throw new Error("Maps price is unavailable.");
  return { ...quote, priceVersion: quote.priceVersion };
}
export function assertMapsPricedRequest(
  request: PricedRequest,
  expected: ProviderRequest,
  projectId: string,
  priceVersion: string,
) {
  const price = localPriceBinding(expected);
  const body: unknown =
    typeof expected.body === "string" ? JSON.parse(expected.body) : expected.body;
  if (
    !(request instanceof PricedRequest) ||
    request.admission.outcome !== "reserved" ||
    request.input.provider !== "dataforseo" ||
    request.input.scope.group !== projectId ||
    request.method !== expected.method ||
    request.url !== expected.url ||
    request.matched.operation === "unknown" ||
    request.matched.operation.id !== price.operation ||
    request.matched.options[price.key] !== price.version ||
    request.admission.operation.providerPriceVersion !== priceVersion ||
    localDigest(request.parsed.body) !== localDigest(body)
  )
    throw new Error("Original priced Maps request changed.");
}
export function assertMapsTaskset(quote: LocalQuote, requests: readonly PricedRequest[]) {
  if (
    requests.length !== quote.expectedTargetKeys.length ||
    !requests.length ||
    new Set(
      requests.map((request) =>
        request.admission.outcome === "reserved" ? request.admission.operation.operationId : null,
      ),
    ).size !== requests.length ||
    localDigest(
      sumMapsNative(
        requests.map((request) =>
          request.estimate.filter(
            (quantity) => !["units", "budget_cents", "paid_attempts"].includes(quantity.unit),
          ),
        ),
      ),
    ) !== localDigest([...quote.nativeEstimates].sort((a, b) => a.unit.localeCompare(b.unit)))
  )
    throw new Error("Maps native taskset estimate changed.");
}
