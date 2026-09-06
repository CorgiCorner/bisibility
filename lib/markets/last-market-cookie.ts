import { appPathContext, appSectionPath, type ProjectRef } from "@/lib/routing/app-path";
import { hasMarketRoute } from "./market-route-sections";

const LAST_MARKET_COOKIE_PREFIX = "bv_last_market_";

export const LAST_MARKET_COOKIE_OPTIONS = {
  httpOnly: false,
  path: "/",
  sameSite: "lax",
} as const;

/** Keyed BY PROJECT, so one browser can sit in a different market in each project. */
export function lastMarketCookieName(projectRef: ProjectRef): string {
  return `${LAST_MARKET_COOKIE_PREFIX}${projectRef}`;
}

/**
 * The public-id shape, restated rather than imported. This module is reached from middleware,
 * which runs on the edge, and `lib/db/public-id` initialises a cuid2 generator at import time
 * that nothing here needs. A unit test asserts this predicate agrees with `isPublicIdOfType`
 * so the two cannot drift apart quietly.
 */
const PUBLIC_ID_SHAPE = /^[a-z]+_[a-z][a-z0-9]{23}$/;

function hasPublicIdShape(value: string, prefix: string): boolean {
  return value.startsWith(`${prefix}_`) && PUBLIC_ID_SHAPE.test(value);
}

export type LastMarketCookieWrite = { name: string; value: string };

export type LastMarketCookieInput = {
  method: string;
  pathname: string;
  /** The request's current value for a cookie name, so a steady-state response sets nothing. */
  readCookie: (name: string) => string | undefined;
};

/**
 * Middleware writes this cookie because a Server Component render cannot set one, so every
 * request that RENDERS a market route records it. It records the segment as REQUESTED and
 * never validates it against the registry: whether the market still resolves is decided when
 * `~` reads it back, which is what makes a stale value harmless.
 *
 * Two things it deliberately does not do. It does not record a URL the app is about to
 * redirect out of - a section with no market route is served at the project level, so
 * remembering the market from that request would let a URL the reader never saw steer their
 * next `~`. And it does not rewrite a value that is already current, because an unconditional
 * Set-Cookie makes every steady-state response uncacheable.
 *
 * Both refs are shape-checked first. They end up in a Set-Cookie header, and a path segment
 * is attacker-controlled.
 */
export function lastMarketCookieWrite({
  method,
  pathname,
  readCookie,
}: LastMarketCookieInput): LastMarketCookieWrite | null {
  if (method !== "GET" && method !== "HEAD") {
    return null;
  }
  const projectRef = pathname.split("/").filter(Boolean)[1];
  if (!projectRef || !hasPublicIdShape(projectRef, "prj")) {
    return null;
  }
  const context = appPathContext(pathname);
  if (context.kind !== "market" || !hasPublicIdShape(context.ref, "pmkt")) {
    return null;
  }
  if (!hasMarketRoute(appSectionPath(pathname))) {
    return null;
  }
  const name = lastMarketCookieName(projectRef);
  return readCookie(name) === context.ref ? null : { name, value: context.ref };
}
