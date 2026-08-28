import "server-only";

import { validateReturnTo } from "@/lib/auth/return-to";
import { appRootPath } from "@/lib/routing/app-path";

function configuredOrigin() {
  for (const candidate of [process.env.SITE_URL, process.env.BETTER_AUTH_URL]) {
    if (candidate && URL.canParse(candidate)) {
      return new URL(candidate).origin;
    }
  }
  return null;
}

export function oauthRequestOrigin(requestUrl: string) {
  return configuredOrigin() ?? new URL(requestUrl).origin;
}

/**
 * The return path travels through OAuth state and query strings, so it is attacker
 * controlled at every call site. It is validated with the same rules as a sign-in
 * `next` target, and any result that still leaves the app origin falls back to `/app`.
 */
export function oauthResultUrl(requestUrl: string, returnPath: string) {
  const origin = oauthRequestOrigin(requestUrl);
  const safePath = validateReturnTo(returnPath) ?? appRootPath();
  const url = new URL(safePath, origin);
  return url.origin === origin ? url : new URL(appRootPath(), origin);
}
