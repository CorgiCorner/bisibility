import { getRequestOriginFromHeaders, resolveCanonicalOriginFromHeaders } from "@/lib/seo/origin";

/** Origin the source should call. Self-host uses the request host, not SITE_URL. */
export function migrationDestinationOrigin(
  headers: Pick<Headers, "get">,
  deployment: "cloud" | "self-host",
) {
  if (deployment === "self-host") {
    return getRequestOriginFromHeaders(headers) ?? resolveCanonicalOriginFromHeaders(headers);
  }
  return resolveCanonicalOriginFromHeaders(headers);
}
