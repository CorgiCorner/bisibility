import { countrySeed } from "./location";
import { resolveKeywordLocation } from "./location-service";
import type { SerpDevice } from "./markets";

export type ProjectDefaultMarketInput = {
  city?: string | null;
  country: string;
  device: SerpDevice;
  locationKey?: string | null;
  projectId: string;
};

export type PersistedProjectDefaultMarket = {
  city: string | null;
  country: string;
  device: SerpDevice;
  locationKey: string;
};

export type ResolvedProjectDefaultMarket = PersistedProjectDefaultMarket & {
  displayName: string;
  locationId: string;
};

function countryName(countryCode: string, fallback: string) {
  return countrySeed(countryCode)?.displayName ?? fallback;
}

export async function resolveProjectDefaultMarket(
  input: ProjectDefaultMarketInput,
): Promise<ResolvedProjectDefaultMarket> {
  const resolved = await resolveKeywordLocation(
    input.locationKey
      ? { projectId: input.projectId, selection: { canonicalKey: input.locationKey, kind: "city" } }
      : { city: input.city, country: input.country, projectId: input.projectId },
  );
  const location = resolved.location;

  return {
    city: location.kind === "city" ? location.displayName : null,
    country: countryName(location.countryCode, input.country),
    device: input.device,
    displayName: location.displayName,
    locationId: location.id,
    locationKey: location.canonicalKey,
  };
}
