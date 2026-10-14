import { supportedLocalLanguage } from "@/lib/local-monitoring/search-languages";
import type { ProviderModule, ProviderRequest } from "@usagekit/providers";
import {
  createDataForSeoMapsModule,
  MAPS_POST_OPERATION,
  MAPS_PRICE_VERSION,
  mapsPriceCurrent,
  mapsRequestOptions,
} from "./dataforseo-maps-module";

export const FINDER_POST_OPERATION = "serp.google.local_finder.task_post";
export const FINDER_GET_OPERATION = "serp.google.local_finder.task_get.advanced";
export const FINDER_PRICE_VERSION = "finder-standard-10-20261014-v1";
const source = "https://dataforseo.com/pricing/google-serp/google-local-finder-serp-api";
export function finderRequestOptions(request: ProviderRequest): Record<string, string> {
  let body: unknown = request.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return { pricingUnknown: "true" };
  }
  const row = Array.isArray(body) && body.length === 1 ? body[0] : null;
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    !supportedLocalLanguage(row.language_code) ||
    Object.hasOwn(row, "search_this_area") ||
    Object.hasOwn(row, "search_places") ||
    typeof row.location_coordinate !== "string" ||
    !/,(?:[4-9]|1[0-8])z$/.test(row.location_coordinate)
  )
    return { pricingUnknown: "true" };
  const shared = mapsRequestOptions({
    ...request,
    body: [{ ...row, search_this_area: true, search_places: false }],
  });
  return shared.pricingUnknown === "true"
    ? shared
    : {
        priority: "normal",
        depth: String(row.depth),
        finderPriceVersion: FINDER_PRICE_VERSION,
      };
}
/** A distinct native operation. Ten-result pages cover conflicting older desktop documentation. */
export function createDataForSeoLocalModule(now: () => Date = () => new Date()): ProviderModule {
  const base = createDataForSeoMapsModule(now);
  return {
    descriptor: {
      ...base.descriptor,
      operations: [
        ...base.descriptor.operations,
        {
          id: FINDER_POST_OPERATION,
          label: "Google Local Finder standard task",
          billable: true,
          match: [{ method: "POST", path: "/v3/serp/google/local_finder/task_post" }],
          optionKeys: ["priority", "depth", "finderPriceVersion"],
          costEvidence: "response",
          requestPricing: {
            source: "https://docs.dataforseo.com/v3/serp/google/local_finder/task_post/",
            formula:
              "0.06 cents per ten-result page, rounded up; standard priority and product depth 1..20",
            priceFields: {
              depth: { formula: "ceil(depth/10) pages" },
              priority: { formula: "priority 1 only" },
            },
            neutralFields: [
              "keyword",
              "location_coordinate",
              "language_code",
              "device",
              "os",
              "tag",
            ],
          },
        },
        {
          id: FINDER_GET_OPERATION,
          label: "Google Local Finder retained result",
          billable: false,
          match: [{ method: "GET", path: "/v3/serp/google/local_finder/task_get/advanced/:id" }],
          costEvidence: "response",
        },
      ],
      prices: [
        ...base.descriptor.prices,
        {
          validFrom: "2026-10-14",
          operation: FINDER_POST_OPERATION,
          option: { priority: "normal", finderPriceVersion: FINDER_PRICE_VERSION },
          unit: "cents",
          perUnit: "0.06",
          calculation: {
            kind: "additional_pages",
            depthOption: "depth",
            pageSize: 10,
            additionalPageFactor: "1",
          },
          source,
          checkedAt: "2026-10-14",
        },
      ],
    },
    extractors: {
      ...base.extractors,
      options: (operation, request) =>
        operation.id === FINDER_POST_OPERATION
          ? finderRequestOptions(request)
          : base.extractors.options(operation, request),
      requiresListPriceFloor: (options) =>
        options.finderPriceVersion === FINDER_PRICE_VERSION ||
        (base.extractors.requiresListPriceFloor?.(options) ?? false),
      canEstimate: (options) =>
        options.finderPriceVersion !== undefined
          ? options.finderPriceVersion === FINDER_PRICE_VERSION &&
            mapsPriceCurrent(now()) &&
            now() >= new Date("2026-10-14T00:00:00.000Z") &&
            options.priority === "normal" &&
            Number.isSafeInteger(Number(options.depth)) &&
            Number(options.depth) >= 1 &&
            Number(options.depth) <= 20
          : (base.extractors.canEstimate?.(options) ?? false),
    },
  };
}
export function localPriceBinding(request: ProviderRequest) {
  const finder =
    new URL(request.url, "https://api.dataforseo.com").pathname ===
    "/v3/serp/google/local_finder/task_post";
  return finder
    ? { operation: FINDER_POST_OPERATION, key: "finderPriceVersion", version: FINDER_PRICE_VERSION }
    : {
        operation: MAPS_POST_OPERATION,
        key: "mapsPriceVersion",
        version: MAPS_PRICE_VERSION,
      };
}
