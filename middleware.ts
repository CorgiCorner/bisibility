import { unsupportedApiVersionResponse } from "@/lib/api/api-versions";
import { selfHostedRobotsTag } from "@/lib/deployment/crawl-control";
import {
  MANAGED_AUTHORIZATION_SERVER_ORIGIN,
  MANAGED_MCP_RESOURCE_ORIGIN,
  MANAGED_MCP_RESOURCE_URL,
} from "@/lib/deployment/mcp-origin-contract";
import { type NextRequest, NextResponse } from "next/server";
import {
  createMarkdownForRequest,
  markdownWordCount,
  shouldServeMarkdown,
  shouldVaryOnAccept,
} from "./lib/agent-ready/markdown-negotiation";
import { ANCHOR_PARAM, RETURN_TO_REQUEST_HEADER, validateAnchor } from "./lib/auth/return-to";
import { SESSION_HINT_COOKIE, SESSION_HINT_COOKIE_OPTIONS } from "./lib/auth/session-hint";

const sessionCookieNames = ["better-auth.session_token", "__Secure-better-auth.session_token"];
const CANONICAL_APP_HOST = new URL(MANAGED_AUTHORIZATION_SERVER_ORIGIN).hostname;
const CANONICAL_MARKETING_HOST = new URL(MANAGED_MCP_RESOURCE_ORIGIN).hostname;
const REGIONAL_MCP_PATHS = new Set(["/api/mcp", "/.well-known/oauth-protected-resource/api/mcp"]);
const REGIONAL_AUTH_METADATA_PATHS = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/.well-known/openid-configuration",
]);
const MARKETING_HOSTS = new Set([CANONICAL_MARKETING_HOST, "www.bisibility.com"]);
// Interactive and API routes stay in the user's regional cell. Everything else
// is a public surface whose canonical production origin is the marketing apex.
const APP_SURFACE_PATHS = [
  "/api",
  "/app",
  "/cloud",
  "/invite",
  "/login",
  "/oauth",
  "/onboarding",
  "/setup",
  "/two-factor",
] as const;
const securityHeaders = {
  "Content-Security-Policy":
    "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
} as const;

function hasSessionCookie(request: NextRequest) {
  return sessionCookieNames.some((name) => request.cookies.has(name));
}

function matchesPathSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isSelfHostDeployment() {
  return process.env.DEPLOYMENT_MODE?.trim().toLowerCase() !== "cloud";
}

function normalizedHost(value: string | null) {
  const firstHost = value?.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  return firstHost.replace(/:\d+$/, "");
}

function requestHost(request: NextRequest) {
  return normalizedHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host,
  );
}

function isAppSurface(pathname: string) {
  return APP_SURFACE_PATHS.some((path) => matchesPathSegment(pathname, path));
}

function regionalMcpResponse(request: NextRequest) {
  if (
    isSelfHostDeployment() ||
    requestHost(request) !== CANONICAL_APP_HOST ||
    !REGIONAL_MCP_PATHS.has(request.nextUrl.pathname)
  ) {
    return null;
  }

  const headers = {
    "Cache-Control": "no-store",
    Link: `<${MANAGED_MCP_RESOURCE_URL}>; rel="canonical"`,
  };
  if (request.method === "HEAD") {
    return new NextResponse(null, { headers, status: 421 });
  }

  return NextResponse.json(
    {
      canonical_resource: MANAGED_MCP_RESOURCE_URL,
      detail: `Hosted MCP is available only at ${MANAGED_MCP_RESOURCE_URL}.`,
      status: 421,
      title: "Misdirected MCP request",
      type: `https://${CANONICAL_MARKETING_HOST}/problems/misdirected-mcp-request`,
    },
    { headers, status: 421 },
  );
}

function canonicalSurfaceRedirect(request: NextRequest) {
  if (isSelfHostDeployment()) {
    return null;
  }

  // The advertised MCP transport is the apex URL. Keep it there so an
  // Authorization header never crosses hosts while following a redirect.
  if (request.nextUrl.pathname === "/api/mcp") {
    return null;
  }

  const host = requestHost(request);
  const appSurface = isAppSurface(request.nextUrl.pathname);
  const regionalAuthMetadata = REGIONAL_AUTH_METADATA_PATHS.has(request.nextUrl.pathname);
  const destinationHost = (() => {
    if (regionalAuthMetadata) {
      return MARKETING_HOSTS.has(host) ? CANONICAL_APP_HOST : null;
    }
    if (appSurface && MARKETING_HOSTS.has(host)) {
      return CANONICAL_APP_HOST;
    }
    if (
      !appSurface &&
      host === CANONICAL_APP_HOST &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return CANONICAL_MARKETING_HOST;
    }
    return null;
  })();

  if (!destinationHost) {
    return null;
  }

  const destination = request.nextUrl.clone();
  destination.protocol = "https:";
  destination.hostname = destinationHost;
  destination.port = "";
  return NextResponse.redirect(destination, 308);
}

function legacyKeywordPathRedirect(request: NextRequest) {
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
function appAnchorRedirect(request: NextRequest) {
  if (
    !matchesPathSegment(request.nextUrl.pathname, "/app") ||
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

function withAcceptVary(response: NextResponse) {
  const vary = response.headers.get("Vary");
  response.headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  return response;
}

function nextResponse(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    RETURN_TO_REQUEST_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Sync the client-readable auth hint with the httpOnly cookie for pre-hydration nav;
// emit Set-Cookie only when stale to keep steady-state responses cacheable.
function withResponsePolicies(request: NextRequest, response: NextResponse) {
  const authed = hasSessionCookie(request);
  const hint = request.cookies.get(SESSION_HINT_COOKIE)?.value;

  if (authed && hint !== "1") {
    response.cookies.set(SESSION_HINT_COOKIE, "1", SESSION_HINT_COOKIE_OPTIONS);
  } else if (!authed && hint !== undefined) {
    response.cookies.set(SESSION_HINT_COOKIE, "", { ...SESSION_HINT_COOKIE_OPTIONS, maxAge: 0 });
  }

  if (isSelfHostDeployment()) {
    const robotsTag = selfHostedRobotsTag();
    if (robotsTag) {
      response.headers.set("X-Robots-Tag", robotsTag);
    }
  }

  return response;
}

export function middleware(request: NextRequest) {
  if (matchesPathSegment(request.nextUrl.pathname, "/api/v1")) {
    const versionError = unsupportedApiVersionResponse(request);
    if (versionError) {
      return withResponsePolicies(request, versionError);
    }
  }

  const misdirectedMcp = regionalMcpResponse(request);
  if (misdirectedMcp) {
    return withResponsePolicies(request, misdirectedMcp);
  }

  const canonicalRedirect = canonicalSurfaceRedirect(request);
  if (canonicalRedirect) {
    return withResponsePolicies(request, canonicalRedirect);
  }

  const legacyRedirect = legacyKeywordPathRedirect(request);
  if (legacyRedirect) {
    return withResponsePolicies(request, legacyRedirect);
  }

  const protectedPath =
    matchesPathSegment(request.nextUrl.pathname, "/app") ||
    matchesPathSegment(request.nextUrl.pathname, "/cloud") ||
    matchesPathSegment(request.nextUrl.pathname, "/onboarding");

  // Self-hosted routes reach their RSC layouts first so an empty installation can
  // redirect straight to /setup. Cloud keeps the existing cookie-first redirect.
  if (protectedPath && !isSelfHostDeployment() && !hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return withResponsePolicies(request, NextResponse.redirect(loginUrl));
  }

  const anchorRedirect = appAnchorRedirect(request);
  if (anchorRedirect) {
    return withResponsePolicies(request, anchorRedirect);
  }

  if (!shouldVaryOnAccept(request)) {
    return withResponsePolicies(request, nextResponse(request));
  }

  if (!shouldServeMarkdown(request)) {
    return withResponsePolicies(request, withAcceptVary(nextResponse(request)));
  }

  const markdown = createMarkdownForRequest(request);
  const body = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
  return withResponsePolicies(
    request,
    withAcceptVary(
      new NextResponse(request.method === "HEAD" ? null : body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "x-markdown-words": String(markdownWordCount(markdown)),
          ...securityHeaders,
        },
      }),
    ),
  );
}

export const config = {
  matcher: [
    "/app/:path*",
    "/onboarding/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:avif|css|gif|ico|jpeg|jpg|js|map|png|svg|webp|xml)$).*)",
  ],
};
