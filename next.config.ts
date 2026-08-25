import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Server runtime env is baked into a server-only module (scripts/deploy/bake-runtime-env.mjs),
// never Next's `env` config, which would inline the values into the client bundle.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const canUploadSentrySourceMaps = Boolean(sentryAuthToken && sentryOrg);
// Uploaded source maps only resolve when the upload release matches the release
// the SDK reports at runtime; sentry.server.config.ts falls back to APP_VERSION,
// which amplify.yml pins to the exact commit SHA.
const sentryRelease = process.env.SENTRY_RELEASE || process.env.APP_VERSION;

export function resolveNextDistDir(value?: string) {
  return value?.trim() || ".next";
}

export function resolveNextOutput(env: Record<string, string | undefined>) {
  return env.AMPLIFY_HOSTING || env.VERCEL ? undefined : "standalone";
}

const nextConfig: NextConfig = {
  // Release E2E intentionally reaches the dev server through the IPv4 loopback address.
  // Next 16 blocks that origin unless it is explicitly allowlisted.
  allowedDevOrigins: ["127.0.0.1"],
  // Next 16 generates its own AGENTS.md at the repository root. This repository keeps a
  // hand-written AGENTS.md carrying the private agent instructions, and a dev or build
  // run overwrote it.
  agentRules: false,
  // Keep managed 8 GB builds below their process limit. More workers made page-data
  // collection fail with spawn ENOMEM and forced the 2.5x compute rate as a workaround.
  experimental: {
    cpus: 2,
  },
  distDir: resolveNextDistDir(process.env.NEXT_DIST_DIR),
  outputFileTracingIncludes: {
    "/*": ["./prisma/migrations/**/*", "./prisma/rds-ca.pem"],
  },
  async headers() {
    // The CSP deliberately leaves script/style/img unrestricted so the Next runtime,
    // Sentry, and analytics keep working; tightening script-src needs nonces.
    const securityHeaders = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value:
          "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
      },
    ];
    return [
      { headers: securityHeaders, source: "/:path*" },
      {
        headers: [
          {
            key: "Link",
            value:
              '</.well-known/api-catalog>; rel="api-catalog", </api/v1/openapi.json>; rel="service-desc", </#quickstart>; rel="service-doc"',
          },
        ],
        source: "/",
      },
      {
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
        source: "/sitemap.xml",
      },
    ];
  },
  async redirects() {
    return [
      {
        destination: "/app/:project/keyword-research",
        permanent: true,
        source: "/app/:project/research",
      },
      {
        // Retired duplicate of the audit log in settings.
        destination: "/app/settings/audit",
        permanent: false,
        source: "/app/activity",
      },
    ];
  },
  // Managed SSR hosts need the native `.next` output; standalone is Docker only.
  output: resolveNextOutput(process.env),
};

export default withSentryConfig(nextConfig, {
  authToken: canUploadSentrySourceMaps ? sentryAuthToken : undefined,
  org: sentryOrg,
  project: "bisibility",
  release: sentryRelease ? { name: sentryRelease } : undefined,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !canUploadSentrySourceMaps,
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
  widenClientFileUpload: canUploadSentrySourceMaps,
});
