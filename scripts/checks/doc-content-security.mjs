import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function checkSecurityContract(selfHostingPages, docsRoot) {
  const failures = [];

  const security = selfHostingPages.get("self-hosting/security.mdx") ?? "";
  if (!security) {
    failures.push("self-hosting/security.mdx is missing.");
    return failures;
  }

  for (const heading of [
    "## TLS and reverse proxy",
    "## Public port exposure",
    "## Trusted client IP",
    "## Fixed OTP",
    "## Application secrets",
    "## PostgreSQL and Valkey exposure",
    "## Webhook SSRF and private-network delivery",
    "## OAuth and public origins",
    "## Health endpoint exposure",
    "## Admin recovery",
    "## Production security checklist",
  ]) {
    if (!security.includes(heading)) {
      failures.push(`self-hosting/security.mdx is missing heading: ${heading}`);
    }
  }

  if (!security.includes("`/api/v1/liveness` is the restart probe")) {
    failures.push("security.mdx must define /api/v1/liveness as the restart probe.");
  }
  if (!security.includes("`/api/v1/readiness` is the traffic-admission probe")) {
    failures.push("security.mdx must define /api/v1/readiness as the traffic-admission probe.");
  }
  if (security.includes("`/api/v1/liveness` is the traffic-admission")) {
    failures.push("security.mdx must not swap liveness/readiness roles.");
  }

  for (const term of [
    "DEMO_FIXED_OTP",
    "DEMO_INSTANCE_INSECURE_AUTH_ACK",
    "BETTER_AUTH_SECRET",
    "BISIBILITY_SECRETS_KEY",
    "BISIBILITY_CLIENT_IP_HEADER",
    "BISIBILITY_CLIENT_IP_XFF_DEPTH",
    "WEBHOOK_ALLOW_PRIVATE_NETWORK",
    "TRUST_REQUEST_ORIGIN",
    "INTERNAL_PROBE_TOKEN",
    "reset-two-factor.ts",
    "--confirm-reset-2fa",
    "no replacement secret",
    "SELF_HOSTED_ALLOW_INDEXING",
  ]) {
    if (!security.includes(term)) {
      failures.push(`self-hosting/security.mdx is missing required coverage: ${term}`);
    }
  }

  if (!security.includes("<Warning>\nA depth larger than your real chain reads a client-supplied entry.")) {
    failures.push("security.mdx must contain the XFF depth Warning component.");
  }
  if (!security.includes("Private-network and\nloopback targets are rejected")) {
    failures.push("security.mdx must state private-network targets are rejected by default.");
  }
  if (!security.includes("Do not\nput `INTERNAL_PROBE_TOKEN` in URLs")) {
    failures.push("security.mdx must warn against putting INTERNAL_PROBE_TOKEN in URLs or logs.");
  }
  if (!security.includes("`/api/auth/*` and `/api/v1/*`")) {
    failures.push("security.mdx must mention routing /api/auth/* and /api/v1/* through the proxy.");
  }
  if (!security.includes("127.0.0.1:3000")) {
    failures.push("security.mdx must state the app binds to loopback.");
  }

  const operations = selfHostingPages.get("self-hosting/operations.mdx") ?? "";
  if (!operations.includes("/self-hosting/security#trusted-client-ip")) {
    failures.push("operations.mdx must link to /self-hosting/security#trusted-client-ip.");
  }
  if (!operations.includes("/self-hosting/security#admin-recovery")) {
    failures.push("operations.mdx must link to /self-hosting/security#admin-recovery.");
  }
  if (operations.includes("proxy_set_header X-Real-IP")) {
    failures.push("operations.mdx must not contain the proxy directive (moved to security page).");
  }
  if (operations.includes("BISIBILITY_CLIENT_IP_XFF_DEPTH` to the number of entries")) {
    failures.push("operations.mdx must not contain XFF depth steps (moved to security page).");
  }
  if (operations.includes("x-forwarded-for`.")) {
    failures.push("operations.mdx must not contain the XFF header setup steps (moved to security page).");
  }
  if (operations.includes("reset-two-factor.ts")) {
    failures.push("operations.mdx must not contain the emergency reset command (moved to security page).");
  }
  if (operations.includes("--confirm-reset-2fa")) {
    failures.push("operations.mdx must not contain --confirm-reset-2fa (moved to security page).");
  }
  if (!operations.includes("## Client IP behind a proxy")) {
    failures.push("operations.mdx must preserve the Client IP behind a proxy heading.");
  }
  if (!operations.includes("## Instance admin")) {
    failures.push("operations.mdx must preserve the Instance admin heading.");
  }

  const docker = selfHostingPages.get("self-hosting/docker.mdx") ?? "";
  if (!docker.includes("/self-hosting/security#")) {
    failures.push("docker.mdx must link to the security page.");
  }

  const configuration = selfHostingPages.get("self-hosting/configuration.mdx") ?? "";
  if (!configuration.includes("/self-hosting/security#trusted-client-ip")) {
    failures.push("configuration.mdx must link to /self-hosting/security#trusted-client-ip.");
  }
  if (!configuration.includes("/self-hosting/security#webhook-ssrf-and-private-network-delivery")) {
    failures.push("configuration.mdx must link to /self-hosting/security#webhook-ssrf-and-private-network-delivery.");
  }

  const hub = selfHostingPages.get("self-hosting.mdx") ?? "";
  if (!hub.includes("/self-hosting/security")) {
    failures.push("self-hosting.mdx must link to the security page.");
  }

  const webhooksPath = join(docsRoot, "api/webhooks.mdx");
  if (existsSync(webhooksPath)) {
    const webhooks = readFileSync(webhooksPath, "utf8");
    if (!webhooks.includes("/self-hosting/security#webhook-ssrf-and-private-network-delivery")) {
      failures.push("api/webhooks.mdx must link to /self-hosting/security#webhook-ssrf-and-private-network-delivery.");
    }
  }

  return failures;
}
