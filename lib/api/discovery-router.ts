import {
  capabilities,
  getHealth,
  getLiveness,
  getOpenApi,
  getReadiness,
  llmsText,
} from "./discovery";
import { canReadDetailedHealth } from "./probe-auth";
import { getCostEstimate, getProviderRates } from "./public-cost";
import { checkRateLimit, rateLimitExceeded } from "./ratelimit";

const discoveryRoutes = new Set([
  "capabilities",
  "cost-estimate",
  "health",
  "liveness",
  "llms.txt",
  "openapi.json",
  "provider-rates",
  "readiness",
]);

export async function handleDiscovery(req: Request, path: string[], preauthenticated = false) {
  if (path.length !== 1 || !discoveryRoutes.has(path[0])) {
    return null;
  }

  const limit = await checkRateLimit(req, { kind: "anonymous" });
  if (!limit.success) {
    return rateLimitExceeded(limit);
  }

  if (path[0] === "health") {
    return getHealth(limit, await canReadDetailedHealth(req, preauthenticated));
  }
  if (path[0] === "liveness") {
    return getLiveness(limit);
  }
  if (path[0] === "readiness") {
    return getReadiness(limit);
  }
  if (path[0] === "openapi.json") {
    return getOpenApi(limit);
  }
  if (path[0] === "capabilities") {
    return capabilities(limit);
  }
  if (path[0] === "provider-rates") {
    return getProviderRates(limit);
  }
  if (path[0] === "cost-estimate") {
    return getCostEstimate(req, limit);
  }
  return llmsText(limit);
}
