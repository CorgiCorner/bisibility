import {
  changeOptions,
  emptyKeywordFilters,
  type KeywordFilters,
  lastCheckOptions,
  positionBuckets,
  serpFeatures,
} from "@/lib/keywords/keyword-filter-model";
import { DEFAULT_LENS_DEVICE, type LensDevice } from "@/lib/keywords/lens-model";
import type { SavedViewConfig } from "@/lib/keywords/saved-view-model";
import { z } from "zod";
import {
  RANK_TRACKER_MAX_PAGE,
  RANK_TRACKER_PAGE_SIZES,
  RANK_TRACKER_SORT_FIELDS,
  type RankTrackerQueryField,
  type RankTrackerQueryParseResult,
  type RankTrackerQueryState,
} from "./rank-tracker-query-types";

export type {
  RankTrackerListQueryInput,
  RankTrackerListResult,
  RankTrackerQueryParseResult,
  RankTrackerQueryState,
  RankTrackerSortDirection,
  RankTrackerSortField,
} from "./rank-tracker-query-types";

export type NextSearchParams = Record<string, string | string[] | undefined>;

const devices = ["all", "desktop", "mobile"] as const satisfies readonly LensDevice[];
const positionIds = positionBuckets.map(({ id }) => id) as [
  (typeof positionBuckets)[number]["id"],
  ...(typeof positionBuckets)[number]["id"][],
];
const changeIds = changeOptions.map(({ id }) => id) as [
  (typeof changeOptions)[number]["id"],
  ...(typeof changeOptions)[number]["id"][],
];
const lastCheckIds = lastCheckOptions.map(({ id }) => id) as [
  (typeof lastCheckOptions)[number]["id"],
  ...(typeof lastCheckOptions)[number]["id"][],
];
const serpIds = serpFeatures.map(({ id }) => id) as [
  (typeof serpFeatures)[number]["id"],
  ...(typeof serpFeatures)[number]["id"][],
];
const text = (max: number) => z.string().trim().max(max);
const booleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());
const numberSchema = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? Number(value) : value),
    z.number().finite().min(minimum).max(maximum),
  );
const schemas = {
  change: z.enum(changeIds),
  contains: text(80),
  device: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.enum(devices),
  ),
  direction: z.enum(["asc", "desc"]),
  grouped: booleanSchema,
  lastCheck: z.enum(lastCheckIds),
  location: text(120),
  page: numberSchema(1, RANK_TRACKER_MAX_PAGE).pipe(z.int()),
  pageSize: numberSchema(25, 100).pipe(
    z.union(RANK_TRACKER_PAGE_SIZES.map((size) => z.literal(size))),
  ),
  savedViewId: text(120),
  search: text(120),
  sort: z.enum(RANK_TRACKER_SORT_FIELDS),
  urlChanged: booleanSchema,
  volMax: numberSchema(0, 50),
  volMin: numberSchema(0, 50),
  wrongUrl: booleanSchema,
};

const PARAM_FIELDS = {
  change: "change",
  contains: "contains",
  device: "device",
  dir: "direction",
  grouped: "grouped",
  intents: "intents",
  lastCheck: "lastCheck",
  location: "location",
  page: "page",
  pageSize: "pageSize",
  position: "position",
  q: "search",
  serp: "serp",
  sort: "sort",
  tags: "tags",
  topics: "topics",
  urlChanged: "urlChanged",
  view: "savedViewId",
  volMax: "volMax",
  volMin: "volMin",
  wrongUrl: "wrongUrl",
} as const satisfies Record<string, RankTrackerQueryField>;

export const defaultRankTrackerQueryState: RankTrackerQueryState = {
  filters: { ...emptyKeywordFilters },
  // Flat is the stable baseline when row-dependent market counts are unavailable.
  grouped: false,
  lens: { device: DEFAULT_LENS_DEVICE, locationId: null },
  page: 1,
  pageSize: 50,
  savedViewId: null,
  search: "",
  sort: { direction: "asc", field: "position" },
};

function values(params: NextSearchParams, key: string) {
  const raw = params[key];
  return raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
}

function scalar(params: NextSearchParams, key: string) {
  return values(params, key)[0];
}

function list(params: NextSearchParams, key: string) {
  return [
    ...new Set(
      values(params, key)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function safe<T>(schema: z.ZodType<T>, raw: unknown, fallback: T, key: string, issues: string[]) {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  issues.push(key);
  return fallback;
}

function stringList(params: NextSearchParams, key: string, maxLength: number, issues: string[]) {
  return safe(z.array(text(maxLength)).max(20), list(params, key), [], key, issues);
}

function enumList(
  params: NextSearchParams,
  key: string,
  allowed: readonly string[],
  max: number,
  issues: string[],
) {
  const raw = list(params, key);
  const filtered = raw.filter((value) => allowed.includes(value));
  if (filtered.length !== raw.length) issues.push(key);
  return safe(z.array(z.string()).max(max), filtered, [], key, issues);
}

export function parseRankTrackerQuery(params: NextSearchParams): RankTrackerQueryParseResult {
  const issues: string[] = [];
  const present = new Set<RankTrackerQueryField>();
  for (const [param, field] of Object.entries(PARAM_FIELDS)) {
    if (params[param] !== undefined) present.add(field);
  }
  const filters: KeywordFilters = {
    change: safe(schemas.change, scalar(params, "change"), "any", "change", issues),
    contains: safe(schemas.contains, scalar(params, "contains") ?? "", "", "contains", issues),
    intents: stringList(params, "intents", 80, issues),
    lastCheck: safe(schemas.lastCheck, scalar(params, "lastCheck"), "any", "lastCheck", issues),
    position: enumList(params, "position", positionIds, 4, issues) as KeywordFilters["position"],
    serp: enumList(params, "serp", serpIds, 6, issues),
    tags: stringList(params, "tags", 40, issues),
    topics: stringList(params, "topics", 80, issues),
    urlChanged: safe(schemas.urlChanged, scalar(params, "urlChanged"), false, "urlChanged", issues),
    volMax: safe(schemas.volMax, scalar(params, "volMax"), 50, "volMax", issues),
    volMin: safe(schemas.volMin, scalar(params, "volMin"), 0, "volMin", issues),
    wrongUrl: safe(schemas.wrongUrl, scalar(params, "wrongUrl"), false, "wrongUrl", issues),
  };
  filters.volMax = Math.max(filters.volMin, filters.volMax);
  const state: RankTrackerQueryState = {
    filters,
    grouped: safe(schemas.grouped, scalar(params, "grouped"), false, "grouped", issues),
    lens: {
      device: safe(schemas.device, scalar(params, "device"), DEFAULT_LENS_DEVICE, "device", issues),
      locationId:
        safe(schemas.location, scalar(params, "location") ?? "", "", "location", issues) || null,
    },
    page: safe(schemas.page, scalar(params, "page"), 1, "page", issues),
    pageSize: safe(schemas.pageSize, scalar(params, "pageSize"), 50, "pageSize", issues),
    savedViewId:
      safe(schemas.savedViewId, scalar(params, "view") ?? "", "", "view", issues) || null,
    search: safe(schemas.search, scalar(params, "q") ?? "", "", "q", issues),
    sort: {
      direction: safe(schemas.direction, scalar(params, "dir"), "asc", "dir", issues),
      field: safe(schemas.sort, scalar(params, "sort"), "position", "sort", issues),
    },
  };
  return { issues: [...new Set(issues)], present, state };
}

const FILTER_PARAMS = [
  ["position", "position"],
  ["change", "change"],
  ["volMin", "volMin"],
  ["volMax", "volMax"],
  ["contains", "contains"],
  ["tags", "tags"],
  ["topics", "topics"],
  ["intents", "intents"],
  ["serp", "serp"],
  ["lastCheck", "lastCheck"],
  ["wrongUrl", "wrongUrl"],
  ["urlChanged", "urlChanged"],
] as const;

function serializedInput(input: RankTrackerQueryState | RankTrackerQueryParseResult) {
  return "state" in input ? input : { present: new Set<RankTrackerQueryField>(), state: input };
}

export function serializeRankTrackerQuery(
  input: RankTrackerQueryState | RankTrackerQueryParseResult,
) {
  const { present, state } = serializedInput(input);
  const params = new URLSearchParams();
  if (state.search || present.has("search")) params.set("q", state.search);
  if (state.lens.locationId || present.has("location")) {
    params.set("location", state.lens.locationId ?? "");
  }
  if (state.lens.device !== DEFAULT_LENS_DEVICE || present.has("device")) {
    params.set("device", state.lens.device);
  }
  for (const [param, field] of FILTER_PARAMS) {
    const value = state.filters[field];
    if (Array.isArray(value) && (value.length || present.has(field))) {
      params.set(param, value.join(","));
    } else if (typeof value === "boolean" && (value || present.has(field))) {
      params.set(param, value ? "1" : "0");
    } else if (
      typeof value === "string" &&
      ((value && (field === "contains" || value !== "any")) ||
        present.has(field) ||
        (state.savedViewId !== null && value === "any"))
    ) {
      params.set(param, value);
    } else if (field === "volMin" && (value !== 0 || present.has(field))) {
      params.set(param, String(value));
    } else if (field === "volMax" && (value !== 50 || present.has(field))) {
      params.set(param, String(value));
    }
  }
  if (state.sort.field !== "position" || present.has("sort")) params.set("sort", state.sort.field);
  if (state.sort.direction !== "asc" || present.has("direction")) {
    params.set("dir", state.sort.direction);
  }
  if (state.page !== 1 || present.has("page")) params.set("page", String(state.page));
  if (state.pageSize !== 50 || present.has("pageSize")) {
    params.set("pageSize", String(state.pageSize));
  }
  if (state.grouped || present.has("grouped")) params.set("grouped", state.grouped ? "1" : "0");
  if (state.savedViewId) params.set("view", state.savedViewId);
  return params;
}

function overrideFilters(
  base: KeywordFilters,
  url: KeywordFilters,
  present: ReadonlySet<RankTrackerQueryField>,
) {
  const filters = { ...base };
  for (const key of Object.keys(url) as Array<keyof KeywordFilters>) {
    if (present.has(key)) filters[key] = url[key] as never;
  }
  return filters;
}

/** URL presence wins over a saved view, including explicit empty and false values. */
export function resolveRankTrackerQuery(
  parsed: RankTrackerQueryParseResult,
  savedView?: SavedViewConfig | null,
): RankTrackerQueryState {
  if (!savedView) return parsed.state;
  const { present, state } = parsed;
  return {
    ...state,
    filters: overrideFilters(savedView.filters, state.filters, present),
    lens: {
      device: present.has("device") ? state.lens.device : savedView.lens.device,
      locationId: present.has("location") ? state.lens.locationId : savedView.lens.locationId,
    },
    search: present.has("search") ? state.search : savedView.search,
  };
}
