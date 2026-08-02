import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Server runtime env is baked into a server-only module (scripts/deploy/bake-runtime-env.mjs),
// never Next's `env` config, which would inline the values into the client bundle.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const canUploadSentrySourceMaps = Boolean(sentryAuthToken && sentryOrg);

const nextConfig: NextConfig = {
  // Keep managed 8 GB builds below their process limit. More workers made page-data
  // collection fail with spawn ENOMEM and forced the 2.5x compute rate as a workaround.
  experimental: {
    cpus: 2,
  },
  outputFileTracingIncludes: {
    "/*": ["./prisma/rds-ca.pem"],
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
        // Retired duplicate of the audit log in settings.
        destination: "/app/settings/audit",
        permanent: false,
        source: "/app/activity",
      },
    ];
  },
  // Amplify's managed SSR build needs the default `.next` output; standalone is Docker only.
  output: process.env.AMPLIFY_HOSTING ? undefined : "standalone",
};

export default withSentryConfig(nextConfig, {
  authToken: canUploadSentrySourceMaps ? sentryAuthToken : undefined,
  org: sentryOrg,
  project: "bisibility",
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
