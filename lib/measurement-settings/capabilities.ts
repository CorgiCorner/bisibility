import {
  DATAFORSEO_OBSERVATION_ADAPTER_VERSION,
  SERPAPI_OBSERVATION_ADAPTER_VERSION,
} from "@/lib/providers/serp/observation-adapter-versions";
import { serpDepthValues } from "@/lib/serp/constants";

/** Product adapter capabilities, distinct from provider marketing and billing catalogs. */
export type MeasurementCapability = {
  providerId: string;
  capabilityVersion: string;
  adapterVersion: string;
  engine: "google";
  surface: "web_serp" | "maps" | "local_finder";
  resultKinds: readonly string[];
  devices: readonly ("desktop" | "mobile")[];
  locationKinds: readonly ("country" | "region" | "city" | "point")[];
  maxDepth: number;
  depths: readonly number[];
  rankScale: "organic_group" | "map_listing" | "local_finder_listing";
  nativeBillingUnit: "cents" | "searches" | "test";
  coordinates: boolean;
  async: boolean;
  zoom: boolean;
  evidence: Readonly<{
    stableIds: "retained_provider_ids" | "unavailable";
    positions: "organic_group_and_provider_axes_when_retained" | "organic_group";
    perKindCoverage: "captured_observation_required";
    pagination: "captured_prefix_required";
    observedTime: "retained_provider_time_or_unknown" | "synthetic_time";
    freshness: "captured_policy_required";
  }>;
};

const web = {
  capabilityVersion: "web-serp-v1",
  adapterVersion: "web-serp-v1",
  engine: "google",
  surface: "web_serp",
  resultKinds: ["organic_result", "local_pack", "ai_overview"],
  devices: ["desktop", "mobile"],
  locationKinds: ["country", "region", "city"],
  maxDepth: 100,
  depths: serpDepthValues,
  rankScale: "organic_group",
  coordinates: false,
  zoom: false,
  evidence: {
    stableIds: "retained_provider_ids",
    positions: "organic_group_and_provider_axes_when_retained",
    perKindCoverage: "captured_observation_required",
    pagination: "captured_prefix_required",
    observedTime: "retained_provider_time_or_unknown",
    freshness: "captured_policy_required",
  },
} as const;

const implemented = [
  {
    ...web,
    adapterVersion: DATAFORSEO_OBSERVATION_ADAPTER_VERSION,
    providerId: "dataforseo",
    nativeBillingUnit: "cents",
    async: true,
  },
  {
    ...web,
    adapterVersion: SERPAPI_OBSERVATION_ADAPTER_VERSION,
    providerId: "serpapi",
    nativeBillingUnit: "searches",
    async: false,
  },
  {
    ...web,
    adapterVersion: "local-sequence-v1",
    evidence: {
      ...web.evidence,
      stableIds: "unavailable",
      positions: "organic_group",
      observedTime: "synthetic_time",
    },
    resultKinds: ["organic_result"],
    providerId: "local-sequence",
    nativeBillingUnit: "test",
    async: false,
  },
] as const satisfies readonly MeasurementCapability[];

/** Unknown surfaces are unsupported until an implemented adapter supplies its own manifest. */
export function measurementCapability(
  providerId: string,
  surface: MeasurementCapability["surface"],
) {
  return (
    implemented.find((entry) => entry.providerId === providerId && entry.surface === surface) ??
    null
  );
}

export function validateMeasurementOptions(input: {
  providerId: string;
  surface: MeasurementCapability["surface"];
  engine: string;
  device: string;
  locationKind: string;
  depth: number;
  coordinates?: { latitude: number; longitude: number };
  zoom?: number;
}) {
  const capability = measurementCapability(input.providerId, input.surface);
  if (!capability) return { supported: false, reason: "unsupported_surface" } as const;
  if (input.engine !== capability.engine)
    return { supported: false, reason: "unsupported_engine" } as const;
  if (!(capability.devices as readonly string[]).includes(input.device))
    return { supported: false, reason: "unsupported_device" } as const;
  if (!(capability.locationKinds as readonly string[]).includes(input.locationKind))
    return { supported: false, reason: "unsupported_location" } as const;
  if (
    !Number.isInteger(input.depth) ||
    !(capability.depths as readonly number[]).includes(input.depth)
  )
    return { supported: false, reason: "unsupported_depth" } as const;
  if (input.coordinates && !capability.coordinates)
    return { supported: false, reason: "unsupported_coordinates" } as const;
  if (input.zoom !== undefined && !capability.zoom)
    return { supported: false, reason: "unsupported_zoom" } as const;
  return { supported: true, capability } as const;
}
