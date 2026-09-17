import { UI_LOCALE_COOKIE } from "@/i18n/config";
import { resolveLocaleHandoff } from "@/i18n/locale-handoff";
import { UI_LOCALE_COOKIE_OPTIONS } from "@/i18n/locale-preference.server";
import { validateReturnTo } from "@/lib/auth/return-to";
import { type NextRequest, NextResponse } from "next/server";

/**
 * This endpoint must run on the regional app host. Marketing links arrive here
 * through the canonical-host proxy, so the UI preference never needs a broad cookie domain.
 *
 * The cookie is host-scoped, so the redirect must not leave the host the request arrived on.
 * `new URL(next, request.url)` normalized to the canonical origin, which dropped the cookie
 * whenever those hosts differed (127.0.0.1 -> localhost). A relative `Location` keeps the
 * Set-Cookie host and the landing host identical by construction.
 */
function relativeRedirect(path: string) {
  return new NextResponse(null, { headers: { Location: path }, status: 303 });
}

export function GET(request: NextRequest) {
  const handoff = resolveLocaleHandoff({
    locale: request.nextUrl.searchParams.get("locale"),
    next: request.nextUrl.searchParams.get("next"),
  });
  if (!handoff) return relativeRedirect("/login");

  // The off-origin guard stays: only a same-origin path ever becomes the destination.
  const response = relativeRedirect(validateReturnTo(handoff.next) ?? "/login");
  response.cookies.set(UI_LOCALE_COOKIE, handoff.locale, UI_LOCALE_COOKIE_OPTIONS);
  return response;
}
