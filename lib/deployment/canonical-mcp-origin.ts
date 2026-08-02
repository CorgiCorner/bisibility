import "server-only";

import "@/lib/deployment/runtime-env.generated";
import {
  isManagedProduction,
  MANAGED_AUTHORIZATION_SERVER_ORIGIN,
  MANAGED_MCP_RESOURCE_ORIGIN,
} from "@/lib/deployment/mcp-origin-contract";

type CanonicalMcpOriginEnvironment = {
  [key: string]: string | undefined;
  BETTER_AUTH_URL?: string;
  DEPLOYMENT_ENV?: string;
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
    throw new Error(`${name} must be a valid HTTP or HTTPS URL for MCP startup.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be a valid HTTP or HTTPS URL for MCP startup.`);
  }
  return url.origin;
}

function shouldAssertCanonicalHostedMcpOrigin(env: CanonicalMcpOriginEnvironment) {
  const deploymentMode = env.DEPLOYMENT_MODE?.trim().toLowerCase();
  return (
    env.NEXT_RUNTIME === "nodejs" &&
    env.NEXT_PHASE !== "phase-production-build" &&
    (deploymentMode === "cloud" || deploymentMode === "self-host")
  );
}

export function assertCanonicalHostedMcpOrigin(env: CanonicalMcpOriginEnvironment = process.env) {
  if (!shouldAssertCanonicalHostedMcpOrigin(env)) return;

  const siteUrl = env.SITE_URL?.trim();
  const authUrl = env.BETTER_AUTH_URL?.trim();
  if (!siteUrl || !authUrl) {
    throw new Error("SITE_URL and BETTER_AUTH_URL must both be configured for MCP startup.");
  }

  const siteOrigin = httpOrigin(siteUrl, "SITE_URL");
  const authOrigin = httpOrigin(authUrl, "BETTER_AUTH_URL");
  if (isManagedProduction(env)) {
    if (
      siteOrigin !== MANAGED_MCP_RESOURCE_ORIGIN ||
      authOrigin !== MANAGED_AUTHORIZATION_SERVER_ORIGIN
    ) {
      throw new Error(
        "Managed production MCP requires the apex resource origin and regional authorization server.",
      );
    }
    return;
  }

  if (siteOrigin !== authOrigin) {
    throw new Error(
      "SITE_URL and BETTER_AUTH_URL must use the same origin outside managed production.",
    );
  }
}
