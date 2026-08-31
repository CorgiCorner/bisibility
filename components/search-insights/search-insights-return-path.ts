export function searchInsightsCurrentReturnPath(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
) {
  const view = new URLSearchParams();
  const property = searchParams.get("property");
  const period = searchParams.get("period");
  if (property) view.set("property", property);
  if (period) view.set("period", period);
  const query = view.toString();
  return query ? `${pathname}?${query}` : pathname;
}

const GA4_SELECTION_PARAMS = ["google", "connect", "provider"] as const;

export function searchInsightsPropertyViewPath(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  property: string,
  preserveGa4OauthSelection: boolean,
) {
  const view = new URLSearchParams();
  view.set("property", property);
  const period = searchParams.get("period");
  if (period) view.set("period", period);
  if (preserveGa4OauthSelection) {
    for (const key of GA4_SELECTION_PARAMS) {
      const value = searchParams.get(key);
      if (value) view.set(key, value);
    }
  }
  return `${pathname}?${view.toString()}`;
}
