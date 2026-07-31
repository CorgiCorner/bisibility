import "server-only";

import { type MigrationReadiness, readMigrationReadiness } from "@/lib/data-migrations/readiness";
import type { MigrationComparison } from "@/lib/db/migration-state";
import { prisma } from "@/lib/db/prisma";
import { getBakedAppRevision } from "@/lib/deployment/runtime-env.generated";
import { getWorkerLivenessDetails, type WorkerLivenessStatus } from "@/lib/ops/liveness";
import { getTemporalSnapshot, type TemporalSnapshotState } from "@/lib/ops/temporal-snapshot";
import { providerRateLimitPolicy } from "@/lib/providers/rate-limit";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { rankCheckSchedulerMode } from "@/lib/rank-check/scheduler-mode";
import {
  DEFAULT_SERP_DEPTH,
  DEFAULT_SERP_DEVICE,
  DEFAULT_SERP_MARKET,
  SERP_ENGINE,
  serpDepthValues,
  serpDeviceOptions,
  serpMarkets,
} from "@/lib/serp/markets";
import { getApiVersionCapabilities } from "./api-versions";
import { getCapabilities, getLlmsText } from "./capabilities";
import type { ApiContext } from "./context";
import { getOpenApiDocument } from "./openapi";
import { jsonResponse, textResponse } from "./responses";

// Group the full catalog by kind so health reflects every integration (serp +
// analytics), not just SERP, removing drift from the 4-provider catalog.
function providersByKind() {
  const grouped: Record<string, string[]> = {};
  for (const provider of PROVIDER_CATALOG) {
    const list = grouped[provider.kind] ?? [];
    list.push(provider.id);
    grouped[provider.kind] = list;
  }
  return grouped;
}

// Configured outbound budget per provider (operability surface for the new limits).
function providerRateLimits() {
  const limits: Record<string, { per_minute: number; window_seconds: number }> = {};
  for (const provider of PROVIDER_CATALOG) {
    const policy = providerRateLimitPolicy(provider.id);
    limits[provider.id] = { per_minute: policy.perMinute, window_seconds: policy.windowSeconds };
  }
  return limits;
}

function serpCapabilities() {
  return {
    default_depth: DEFAULT_SERP_DEPTH,
    default_device: DEFAULT_SERP_DEVICE,
    default_market: DEFAULT_SERP_MARKET,
    depths: serpDepthValues,
    devices: serpDeviceOptions,
    engine: SERP_ENGINE,
    markets: serpMarkets.map((market) => ({
      gl: market.google.gl,
      language_code: market.language.code,
      language_label: market.language.label,
      name: market.name,
    })),
  };
}

type RuntimeHealthStatus = "degraded" | "down" | "ok" | "unknown";

// Missing telemetry is healthy for web-only deployments; only observed-then-lost
// telemetry or partial signals degrade health.
function runtimeHealthStatus(
  status: WorkerLivenessStatus | TemporalSnapshotState["status"] | null,
): RuntimeHealthStatus {
  if (status === "ok") return "ok";
  if (status === "stale") return "down";
  return status === "unknown" || status === null ? "unknown" : "degraded";
}

function runtimeHealthFailed(status: RuntimeHealthStatus) {
  return status === "degraded" || status === "down";
}

function workerSchemaHealth(comparison: MigrationComparison): "drift" | "ok" | "unknown" {
  if (comparison === "ok") return "ok";
  return comparison === "unknown" ? "unknown" : "drift";
}

function appRelease() {
  return process.env.APP_VERSION?.trim() || process.env.SENTRY_RELEASE?.trim() || "unknown";
}

function appIdentity() {
  return {
    app: "ok",
    appRelease: appRelease(),
    appRevision: getBakedAppRevision(),
  };
}

async function readApplicationReadiness() {
  let database = "ok";
  let migrations: MigrationReadiness | "unknown" = "unknown";

  try {
    const [, readiness] = await Promise.all([prisma.$queryRaw`SELECT 1`, readMigrationReadiness()]);
    migrations = readiness;
  } catch {
    database = "degraded";
  }
  return { database, migrations };
}

function readinessFailed(readiness: Awaited<ReturnType<typeof readApplicationReadiness>>) {
  return readiness.database !== "ok" || readiness.migrations !== "ready";
}

export function getLiveness(ctx: Pick<ApiContext, "headers">) {
  return jsonResponse(
    {
      checked_at: new Date().toISOString(),
      services: appIdentity(),
      status: "ok",
    },
    { headers: ctx.headers },
  );
}

export async function getReadiness(ctx: Pick<ApiContext, "headers">) {
  const readiness = await readApplicationReadiness();
  const degraded = readinessFailed(readiness);
  return jsonResponse(
    {
      checked_at: new Date().toISOString(),
      services: { ...appIdentity(), ...readiness },
      status: degraded ? "degraded" : "ok",
    },
    { headers: ctx.headers, status: degraded ? 503 : 200 },
  );
}

export async function getHealth(ctx: Pick<ApiContext, "headers">) {
  const readiness = await readApplicationReadiness();
  const [workerLiveness, temporalSnapshot] = await Promise.all([
    getWorkerLivenessDetails(),
    getTemporalSnapshot(),
  ]);
  const worker = runtimeHealthStatus(workerLiveness.status);
  const workerSchema = workerSchemaHealth(workerLiveness.schemaComparison);
  const temporal = runtimeHealthStatus(temporalSnapshot?.status ?? null);
  const degraded =
    readinessFailed(readiness) ||
    runtimeHealthFailed(worker) ||
    runtimeHealthFailed(temporal) ||
    workerSchema === "drift";

  return jsonResponse(
    {
      checked_at: new Date().toISOString(),
      providers: providersByKind(),
      rate_limits: providerRateLimits(),
      readiness: readinessFailed(readiness) ? "degraded" : "ok",
      serp: serpCapabilities(),
      services: {
        ...appIdentity(),
        appEnvironment:
          process.env.DEPLOYMENT_ENV?.trim() ||
          process.env.BISIBILITY_ENV?.trim() ||
          process.env.NODE_ENV?.trim() ||
          "unknown",
        appRankCheckSchedulerMode: rankCheckSchedulerMode(),
        ...readiness,
        lastHeartbeatAt: workerLiveness.lastSeenAt,
        temporal,
        worker,
        workerEnvironment: workerLiveness.environment,
        workerHeartbeatState: workerLiveness.heartbeatState,
        workerRankCheckSchedulerMode: workerLiveness.schedulerMode,
        workerRelease: workerLiveness.release,
        workerRevision: workerLiveness.revision ?? "unknown",
        workerSchema,
      },
      liveness: "ok",
      status: degraded ? "degraded" : "ok",
    },
    { headers: ctx.headers, status: degraded ? 503 : 200 },
  );
}

export function getOpenApi(ctx: Pick<ApiContext, "headers">) {
  return jsonResponse(getOpenApiDocument(), { headers: ctx.headers });
}

export function capabilities(ctx: Pick<ApiContext, "headers">) {
  return jsonResponse(
    { ...getApiVersionCapabilities(), data: getCapabilities() },
    { headers: ctx.headers },
  );
}

export function llmsText(ctx: Pick<ApiContext, "headers">) {
  return textResponse(getLlmsText(), { headers: ctx.headers });
}
