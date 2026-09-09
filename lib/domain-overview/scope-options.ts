import {
  type ResearchScope,
  researchScopeForLocation,
  researchScopeOptionsForProject,
} from "@/lib/research/scope";
import { serpCountryCatalog } from "@/lib/serp/country-catalog";
import { countryLanguages } from "@/lib/serp/country-language";

type TrackedLocation = {
  countryCode: string;
  languageCode: string;
  languageLabel: string;
};

export function domainOverviewUnavailableMessage(scope: ResearchScope) {
  return `Research is not available for ${scope.countryName} / ${scope.languageLabel}. Rank tracking is unaffected.`;
}

export function domainOverviewCatalogScopes(): ResearchScope[] {
  return serpCountryCatalog.flatMap((country) =>
    countryLanguages(country.countryCode).flatMap((language) => {
      const scope = researchScopeForLocation({
        countryCode: country.countryCode,
        languageCode: language.code,
        languageLabel: language.label,
      });
      return scope.researchAvailable ? [scope] : [];
    }),
  );
}

export function domainOverviewTrackedScopes(
  locations: readonly TrackedLocation[],
): ResearchScope[] {
  return researchScopeOptionsForProject(locations);
}
