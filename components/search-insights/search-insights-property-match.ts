import { googlePropertyMatchesDomain } from "@/lib/integrations/google-property-grouping";
import type { SearchInsightsProperty } from "@/lib/search-insights/queries/context";

export function matchesProjectDomain(
  property: Pick<SearchInsightsProperty, "value">,
  domain: string,
) {
  return googlePropertyMatchesDomain(property.value, domain);
}
