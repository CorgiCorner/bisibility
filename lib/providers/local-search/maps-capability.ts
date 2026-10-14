import type { LocalCapability } from "@/lib/local-monitoring/capability";
import { MAPS_REQUEST_SCOPE } from "@/lib/local-monitoring/maps-request-scope";
import {
  MAPS_PRICE_EXPIRES_AT,
  MAPS_PRICE_VERSION,
  mapsPriceCurrent,
  mapsRequestOptions,
} from "@/lib/provider-rates/dataforseo-maps-module";
import type { LocalProviderBinding } from "./contracts";
import { buildLocalTaskRequest, validateLocalBinding } from "./request";

export const MAPS_LEGACY_ADAPTER_VERSION = "dataforseo-maps-task-v1";
export const MAPS_ADAPTER_VERSION = "dataforseo-maps-task-v2";
export function supportedMapsAdapterVersion(value: string) {
  return value === MAPS_ADAPTER_VERSION || value === MAPS_LEGACY_ADAPTER_VERSION;
}
export const MAPS_CAPABILITY_VERSION = `dataforseo-maps-en-v2:${MAPS_PRICE_VERSION}`;
function registeredCapability(
  expiresAt: string,
  adapterVersion = MAPS_ADAPTER_VERSION,
): LocalCapability {
  return Object.freeze({
    version: MAPS_CAPABILITY_VERSION,
    provider: "dataforseo",
    adapterVersion,
    expiresAt,
    nativeBillingUnit: "cents",
    implementations: Object.freeze([
      {
        evidenceVersion: adapterVersion,
        ...MAPS_REQUEST_SCOPE,
        point: true as const,
        asyncSubmitCollect: true as const,
      },
    ]),
  });
}
export function mapsTaskRequest(binding: LocalProviderBinding) {
  validateLocalBinding(binding);
  if (binding.target.surface !== "maps" || binding.target.language !== "en")
    throw new Error("Unsupported registered Maps scope.");
  const request = buildLocalTaskRequest(binding);
  const body: unknown = JSON.parse(String(request.body));
  if (!Array.isArray(body) || body.length !== 1)
    throw new Error("One Maps task per original item is required.");
  request.body = JSON.stringify([{ ...body[0], search_this_area: true, search_places: false }]);
  if (mapsRequestOptions(request).pricingUnknown === "true")
    throw new Error("Unsupported Maps request options.");
  return request;
}

export function mapsCapability(now: Date) {
  if (!mapsPriceCurrent(now))
    throw new Error("Maps pricing snapshot expired; review provider support and price.");
  return registeredCapability(
    new Date(Math.min(now.getTime() + 600_000, Date.parse(MAPS_PRICE_EXPIRES_AT))).toISOString(),
  );
}
/** Expiry blocks new work; it never blocks custody-verified collection of accepted tasks. */
export function mapsRetrievalCapability(adapterVersion = MAPS_ADAPTER_VERSION) {
  if (!supportedMapsAdapterVersion(adapterVersion))
    throw new Error("Unsupported original Maps adapter.");
  return registeredCapability("1970-01-01T00:00:00.000Z", adapterVersion);
}
