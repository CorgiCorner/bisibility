import "server-only";

import "@/lib/deployment/runtime-env.generated";

type CanonicalMcpOriginEnvironment = {
  [key: string]: string | undefined;
  BETTER_AUTH_URL?: string;
  DEPLOYMENT_MODE?: string;
  NEXT_PHASE?: string;
  NEXT_RUNTIME?: string;
  SITE_URL?: string;
};

function httpOrigin(value: string, name: "BETTER_AUTH_URL" | "SITE_URL") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP or HTTPS URL for hosted MCP startup.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be a valid HTTP or HTTPS URL for hosted MCP startup.`);
  }
  return url.origin;
}

function shouldAssertCanonicalHostedMcpOrigin(env: CanonicalMcpOriginEnvironment) {
  return (
    env.NEXT_RUNTIME === "nodejs" &&
    env.NEXT_PHASE !== "phase-production-build" &&
    env.DEPLOYMENT_MODE?.trim().toLowerCase() === "cloud"
  );
}

export function assertCanonicalHostedMcpOrigin(env: CanonicalMcpOriginEnvironment = process.env) {
  if (!shouldAssertCanonicalHostedMcpOrigin(env)) return;

  const siteUrl = env.SITE_URL?.trim();
  const authUrl = env.BETTER_AUTH_URL?.trim();
  if (!siteUrl || !authUrl) {
    throw new Error("SITE_URL and BETTER_AUTH_URL must both be configured for hosted MCP startup.");
  }

  if (httpOrigin(siteUrl, "SITE_URL") !== httpOrigin(authUrl, "BETTER_AUTH_URL")) {
    throw new Error("SITE_URL and BETTER_AUTH_URL must use the same origin for hosted MCP.");
  }
}
