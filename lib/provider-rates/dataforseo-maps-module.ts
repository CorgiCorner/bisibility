import { supportedLocalLanguage } from "@/lib/local-monitoring/search-languages";
import { dataforseo, type ProviderModule, type ProviderRequest } from "@usagekit/providers";

export const MAPS_POST_OPERATION = "serp.google.maps.task_post";
export const MAPS_GET_OPERATION = "serp.google.maps.task_get.advanced";
export const MAPS_PRICE_VERSION = "maps-standard-100-20261012-v1";
export const MAPS_PRICE_EXPIRES_AT = "2026-10-26T00:00:00.000Z";
const source = "https://dataforseo.com/pricing/serp/google-maps-serp-api";
const docs = "https://docs.dataforseo.com/v3/serp-google-maps-task_post/";
const neutralFields = [
  "keyword",
  "location_coordinate",
  "language_code",
  "device",
  "os",
  "search_this_area",
  "search_places",
  "tag",
];
const fields = new Set([...neutralFields, "depth", "priority"]);
const operators =
  /(?:^|\s)-?(?:allinanchor|allintext|allintitle|allinurl|cache|define|definition|filetype|id|inanchor|info|intext|intitle|inurl|link|site):/iu;

export function mapsPriceCurrent(now: Date) {
  return (
    Number.isFinite(now.getTime()) &&
    now >= new Date("2026-10-12T00:00:00.000Z") &&
    now < new Date(MAPS_PRICE_EXPIRES_AT)
  );
}
export function mapsRequestOptions(request: ProviderRequest): Record<string, string> {
  let body: unknown = request.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return { pricingUnknown: "true" };
  }
  const task = Array.isArray(body) && body.length === 1 ? body[0] : null;
  if (!task || typeof task !== "object" || Array.isArray(task)) return { pricingUnknown: "true" };
  const row: Record<string, unknown> = task;
  let keyword: string;
  try {
    keyword = decodeURIComponent(String(row.keyword).replace(/\+/g, " "));
  } catch {
    return { pricingUnknown: "true" };
  }
  const coordinates =
    typeof row.location_coordinate === "string" ? row.location_coordinate.split(",") : [];
  const latitude = Number(coordinates[0]),
    longitude = Number(coordinates[1]);
  const os =
    row.device === "desktop"
      ? ["windows", "macos"]
      : row.device === "mobile"
        ? ["android", "ios"]
        : [];
  if (
    Object.keys(row).some((key) => !fields.has(key)) ||
    typeof row.keyword !== "string" ||
    !keyword.length ||
    [...keyword].length > 700 ||
    Array.from(keyword).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    operators.test(keyword) ||
    row.priority !== 1 ||
    !Number.isSafeInteger(row.depth) ||
    Number(row.depth) < 1 ||
    Number(row.depth) > 20 ||
    !supportedLocalLanguage(row.language_code) ||
    !os.includes(String(row.os)) ||
    row.search_this_area !== true ||
    row.search_places !== false ||
    coordinates.length !== 3 ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    typeof row.location_coordinate !== "string" ||
    !/^-?\d+(?:\.\d{1,7})?,-?\d+(?:\.\d{1,7})?,(?:[3-9]|1\d|2[01])z$/.test(row.location_coordinate)
  )
    return { pricingUnknown: "true" };
  return { priority: "normal", depth: String(row.depth), mapsPriceVersion: MAPS_PRICE_VERSION };
}

/** A bounded, source-dated extension. Other installed provider operations are unchanged. */
export function createDataForSeoMapsModule(now: () => Date = () => new Date()): ProviderModule {
  return {
    descriptor: {
      ...dataforseo.descriptor,
      operations: [
        ...dataforseo.descriptor.operations,
        {
          id: MAPS_POST_OPERATION,
          label: "Google Maps standard task",
          billable: true,
          match: [{ method: "POST", path: "/v3/serp/google/maps/task_post" }],
          optionKeys: ["priority", "depth", "mapsPriceVersion"],
          costEvidence: "response",
          requestPricing: {
            source: docs,
            formula:
              "0.06 cents per standard task of up to 100 results; product depth 1..20, no paid operators or add-ons",
            priceFields: {
              depth: { formula: "one page for supported depth 1..20" },
              priority: { formula: "standard priority 1 only" },
            },
            neutralFields,
          },
        },
        {
          id: MAPS_GET_OPERATION,
          label: "Google Maps retained task result",
          billable: false,
          match: [{ method: "GET", path: "/v3/serp/google/maps/task_get/advanced/:id" }],
          costEvidence: "response",
        },
      ],
      prices: [
        ...dataforseo.descriptor.prices,
        {
          validFrom: "2026-10-12",
          operation: MAPS_POST_OPERATION,
          option: { priority: "normal", mapsPriceVersion: MAPS_PRICE_VERSION },
          unit: "cents",
          perUnit: "0.06",
          source,
          checkedAt: "2026-10-12",
        },
      ],
    },
    extractors: {
      ...dataforseo.extractors,
      options: (operation, request) =>
        operation.id === MAPS_POST_OPERATION
          ? mapsRequestOptions(request)
          : dataforseo.extractors.options(operation, request),
      requiresListPriceFloor: (options) =>
        options.mapsPriceVersion === MAPS_PRICE_VERSION ||
        (dataforseo.extractors.requiresListPriceFloor?.(options) ?? false),
      canEstimate: (options) =>
        options.mapsPriceVersion !== undefined
          ? options.mapsPriceVersion === MAPS_PRICE_VERSION &&
            mapsPriceCurrent(now()) &&
            options.priority === "normal" &&
            Number.isSafeInteger(Number(options.depth)) &&
            Number(options.depth) >= 1 &&
            Number(options.depth) <= 20
          : (dataforseo.extractors.canEstimate?.(options) ?? options.pricingUnknown !== "true"),
    },
  };
}
