import { centsToDollars } from "@/lib/format/currency";
import { DATAFORSEO_LIVE_RANK_CHECK_COST_CENTS } from "./provider-rates";

export const DATAFORSEO_LIVE_RANK_CHECK_COST = `$${centsToDollars(
  DATAFORSEO_LIVE_RANK_CHECK_COST_CENTS,
).toFixed(3)}`;

export const OWN_PROVIDER_KEY_COST_EXPLANATION = `bisibility does not scrape Google. You connect a data provider (like DataForSEO) with your own API key - a check costs from about ${DATAFORSEO_LIVE_RANK_CHECK_COST}.`;
