export type NextSearchParams = Record<string, string | string[] | undefined>;

export function rankTrackerParamValues(params: NextSearchParams, key: string) {
  const raw = params[key];
  return raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
}

/** A present empty scalar array is malformed; only an omitted optional scalar uses its default. */
export function rankTrackerScalarParam(params: NextSearchParams, key: string) {
  return rankTrackerParamValues(params, key)[0] ?? (params[key] === undefined ? undefined : null);
}
