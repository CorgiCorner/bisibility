import "server-only";

import { costEstimateQuerySchema as querySchema } from "@/lib/cost-estimate/api-contract";
import { estimateForQuery, optionResponse, planResponse } from "@/lib/cost-estimate/api-estimate";
import type { ProviderRate } from "@/lib/cost-estimate/estimate";

export {
  COST_ESTIMATE_MAX_KEYWORDS,
  COST_ESTIMATE_MAX_LOCATIONS,
} from "@/lib/cost-estimate/api-contract";

import { PROVIDER_RATES, rateForProvider } from "@/lib/cost-estimate/provider-rates";
import { ZodError, z } from "zod";
import type { ApiContext } from "./context";
import { dataResponse, errorResponse } from "./responses";

type AnonymousContext = Pick<ApiContext, "headers">;

function instance(req: Request) {
  return `urn:bisibility:api:v1:${new URL(req.url).pathname}`;
}

function queryValue(params: URLSearchParams, key: string) {
  return params.get(key) ?? undefined;
}

function costQuery(req: Request) {
  const params = new URL(req.url).searchParams;

  return querySchema.parse({
    cron_expression: queryValue(params, "cron_expression"),
    devices: queryValue(params, "devices"),
    depth: queryValue(params, "depth"),
    frequency: queryValue(params, "frequency"),
    keywords: queryValue(params, "keywords"),
    locations: queryValue(params, "locations"),
    option: queryValue(params, "option"),
    plan: queryValue(params, "plan"),
    provider: queryValue(params, "provider"),
  });
}

function providerRateResponse(rate: ProviderRate) {
  return {
    checked_at: rate.checkedAt,
    label: rate.label,
    notes: rate.notes,
    provider_id: rate.providerId,
    pricing_model: rate.pricingModel,
    source_url: rate.sourceUrl,
    ...(rate.pricingModel === "flat"
      ? { options: rate.options.map(optionResponse) }
      : { plans: rate.plans.map(planResponse) }),
  };
}

export function getProviderRates(ctx: AnonymousContext) {
  return dataResponse(PROVIDER_RATES.map(providerRateResponse), { headers: ctx.headers });
}

export function getCostEstimate(req: Request, ctx: AnonymousContext) {
  let query: z.infer<typeof querySchema>;

  try {
    query = costQuery(req);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("validation_failed", "Request input failed validation.", 400, {
        details: z.flattenError(error),
        headers: ctx.headers,
        instance: instance(req),
      });
    }

    throw error;
  }

  const rate = rateForProvider(query.provider);
  if (!rate) {
    return errorResponse("not_found", "Provider rate not found.", 404, {
      headers: ctx.headers,
      instance: instance(req),
    });
  }

  return dataResponse(estimateForQuery(query, rate), { headers: ctx.headers });
}
