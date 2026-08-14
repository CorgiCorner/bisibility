import {
  DEFAULT_ONBOARDING_LOCATION_KEY,
  legacyCountryLocationCandidates,
  MAX_ONBOARDING_LOCATIONS,
  onboardingLocationCandidates,
  uniqueLocationCandidates,
} from "@/components/onboarding/onboarding-locations";
import {
  existingOnboardingCityLocationKeys,
  getOnboardingProjectMarketKeys,
} from "@/lib/queries/onboarding";

async function validatedLocations(locValues: readonly string[], countryValues: readonly string[]) {
  const candidates = uniqueLocationCandidates([
    ...onboardingLocationCandidates(locValues),
    ...legacyCountryLocationCandidates(countryValues),
  ]);
  const cityKeys = candidates
    .filter((candidate) => candidate.kind === "city")
    .map((candidate) => candidate.key);
  const existingCityKeys = await existingOnboardingCityLocationKeys(cityKeys);
  return candidates.flatMap((candidate) => {
    if (candidate.kind === "country" || existingCityKeys.has(candidate.key)) {
      return [candidate.key];
    }
    return [];
  });
}

export async function resolveOnboardingLocations(input: {
  countryValues: readonly string[];
  locValues: readonly string[];
  projectId: string | null;
}) {
  const explicit = await validatedLocations(input.locValues, input.countryValues);
  if (explicit.length > 0) return explicit.slice(0, MAX_ONBOARDING_LOCATIONS);
  const persistedKeys = input.projectId
    ? await getOnboardingProjectMarketKeys(input.projectId)
    : [];
  const persisted = await validatedLocations(persistedKeys, []);
  return (persisted.length > 0 ? persisted : [DEFAULT_ONBOARDING_LOCATION_KEY]).slice(
    0,
    MAX_ONBOARDING_LOCATIONS,
  );
}
