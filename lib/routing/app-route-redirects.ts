import { ANCHOR_PARAM, validateAnchor } from "@/lib/auth/return-to";
import { type NextRequest, NextResponse } from "next/server";

export function legacyKeywordPathRedirect(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const { pathname } = request.nextUrl;
  const match = pathname.match(/^\/app\/([^/]+)\/keywords\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const destination = request.nextUrl.clone();
  destination.pathname = `/app/${match[1]}/rank-tracker/${match[2]}`;
  return NextResponse.redirect(destination, 302);
}

// Middleware covers every app route and restores the anchor before rendering without a client effect.
export function appAnchorRedirect(request: NextRequest) {
  if (
    !/^\/app(?:\/|$)/.test(request.nextUrl.pathname) ||
    // Runs owns `section` as a query filter, not a restored document anchor.
    /^\/app\/[^/]+\/runs\/?$/.test(request.nextUrl.pathname) ||
    !request.nextUrl.searchParams.has(ANCHOR_PARAM)
  ) {
    return null;
  }

  const destination = request.nextUrl.clone();
  const anchor = validateAnchor(destination.searchParams.get(ANCHOR_PARAM));
  destination.searchParams.delete(ANCHOR_PARAM);
  destination.hash = anchor ?? "";
  return NextResponse.redirect(destination);
}
