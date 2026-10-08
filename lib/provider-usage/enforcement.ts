import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { type AdmissionObservation, compareAdmission } from "@/lib/metering/admission";
import { catalogEntry } from "@/lib/provider-allocations/validation";
import type { ProviderAllocationUnit } from "@/lib/providers/allocation-catalog";
import { readDeploymentMeteringPreflightAuthority } from "@/lib/providers/execution-authority";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { isBudgetExhaustedError, monthUtcRange } from "@/lib/rank-check/budget";
import { aggregateConnectionUsage, type UsageCredentialSource } from "./connection-usage";
import type { ProviderRequestSurface } from "./surface";
import { SOURCES_BY_SURFACE } from "./surface";

type DbClient = PrismaClient | Prisma.TransactionClient;
type EnforcementClient = {
  project: Pick<DbClient["project"], "findUnique">;
  providerConnection: Pick<DbClient["providerConnection"], "findFirst">;
  providerCostEntry: Pick<DbClient["providerCostEntry"], "aggregate" | "count" | "groupBy">;
};
export class ProviderAllocationExhaustedError extends Error {
  constructor(
    readonly connectionId: string,
    readonly surface: ProviderRequestSurface,
  ) {
    super(`Provider connection monthly allocation reached for the ${surface} surface.`);
    this.name = "ProviderAllocationExhaustedError";
  }
}

type Input = {
  shadow?: AdmissionObservation["shadow"];
  catalog: readonly ProviderCatalogEntry[];
  connectionId: string;
  estimatedCostCents: number;
  estimatedUsageQuantity?: number;
  legacyBudgetCheck?: (capCents: number, estimate: number) => Promise<void>;
  now?: Date;
  projectId: string;
  provider: string;
  surface: ProviderRequestSurface;
};

function estimate(value: number | undefined, fallback: number) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < 0)
    throw new RangeError("Provider usage estimate is invalid.");
  return result;
}

export async function assertProviderAllocationAvailable(input: Input, db: EnforcementClient) {
  try {
    const result = await evaluateProviderAllocation(input, db);
    await compareAdmission(input, "allowed");
    return result;
  } catch (error) {
    if (error instanceof ProviderAllocationExhaustedError || isBudgetExhaustedError(error))
      await compareAdmission(input, "blocked");
    throw error;
  }
}

type StoredSourceBudget = {
  allocationAmountPerMonth: number | null;
  allocationUnit: ProviderAllocationUnit | null;
  credentialSource: UsageCredentialSource;
  creditsAllocationAmountPerMonth: number | null;
  creditsProgrammaticAllocationAmountPerMonth: number | null;
  programmaticAllocationAmountPerMonth: number | null;
};

/**
 * Own keys and credits keep separate budgets. The connection's current source
 * picks the budget and the usage it is measured against; the other source's
 * budget and spend never take part.
 */
function sourceBudget(
  connection: StoredSourceBudget,
  input: Pick<Input, "catalog" | "provider" | "surface">,
): { cap: number; credentialSource: UsageCredentialSource; unit: ProviderAllocationUnit } | null {
  const metadata = catalogEntry(input.catalog, input.provider).allocation;
  if (connection.credentialSource === "hosted") {
    const cap =
      input.surface === "programmatic"
        ? connection.creditsProgrammaticAllocationAmountPerMonth
        : connection.creditsAllocationAmountPerMonth;
    if (cap == null) return null;
    if (metadata.kind !== "billable")
      throw new TypeError("Stored allocation does not match provider metadata.");
    // Credits budgets are always cents of charged credits price.
    return { cap, credentialSource: "hosted", unit: "cents" };
  }
  const cap =
    (input.surface === "programmatic"
      ? connection.programmaticAllocationAmountPerMonth
      : connection.allocationAmountPerMonth) ?? null;
  if (cap === null) return null;
  // The unit column is shared by both own-keys caps. The storage pair constraint keeps
  // it null while the app cap is unset, so a programmatic-only cap falls back to the
  // catalog unit its amount was validated against when it was stored.
  const unit =
    connection.allocationUnit ??
    (input.surface === "programmatic" && metadata.kind === "billable"
      ? metadata.allocationUnit
      : null);
  if (!unit) return null;
  if (metadata.kind !== "billable" || metadata.allocationUnit !== unit)
    throw new TypeError("Stored allocation does not match provider metadata.");
  return { cap, credentialSource: "own", unit };
}

async function evaluateProviderAllocation(input: Input, db: EnforcementClient) {
  const project = await db.project.findUnique({
    select: { budgetCapCents: true, providerAllocationsInitializedAt: true },
    where: { id: input.projectId },
  });
  if (!project) throw new Error("Project not found.");
  const authority = await readDeploymentMeteringPreflightAuthority(input.connectionId);
  if (authority === "draining") throw new ProviderUsagePersistenceError();
  if (!project.providerAllocationsInitializedAt && authority !== "active") {
    await input.legacyBudgetCheck?.(project.budgetCapCents, input.estimatedCostCents);
    return { mode: "legacy" as const, remaining: project.budgetCapCents };
  }
  const connection = await db.providerConnection.findFirst({
    select: {
      allocationAmountPerMonth: true,
      allocationUnit: true,
      credentialSource: true,
      creditsAllocationAmountPerMonth: true,
      creditsProgrammaticAllocationAmountPerMonth: true,
      programmaticAllocationAmountPerMonth: true,
    },
    where: { id: input.connectionId, projectId: input.projectId, provider: input.provider },
  });
  if (!connection) throw new Error("Provider connection not found.");
  if (authority === "active")
    return {
      mode: "allocation" as const,
      remaining: null,
      surface: input.surface,
      unit:
        connection.credentialSource === "hosted" ? ("cents" as const) : connection.allocationUnit,
    };
  const budget = sourceBudget(connection, input);
  if (!budget)
    return { mode: "allocation" as const, remaining: null, surface: input.surface, unit: null };
  const { cap, credentialSource, unit } = budget;
  const { used, unconfirmedCount } = await aggregateConnectionUsage(db, {
    connectionId: input.connectionId,
    credentialSource,
    now: input.now,
    projectId: input.projectId,
    surface: input.surface,
    unit,
  });
  if (unconfirmedCount > 0) {
    const unresolved = await db.providerCostEntry.count({
      where: {
        connectionId: input.connectionId,
        projectId: input.projectId,
        cached: false,
        createdAt: monthUtcRange(input.now),
        credentialSource,
        AND: [
          input.surface === "app"
            ? { OR: [{ source: { in: [...SOURCES_BY_SURFACE.app] } }, { source: null }] }
            : { source: { in: [...SOURCES_BY_SURFACE.programmatic] } },
          {
            OR: [
              {
                measurementStatus: "unknown",
                OR: [
                  { failed: true },
                  {
                    createdAt: { lt: new Date((input.now ?? new Date()).getTime() - 15 * 60_000) },
                  },
                ],
              },
              // A recorded credits row without a price is an unresolved charge, not a
              // settled zero-cost request; so is a recorded own row without a quantity.
              ...(credentialSource === "hosted"
                ? [{ measurementStatus: "recorded" as const, priceCents: null }]
                : unit === "units"
                  ? [{ measurementStatus: "recorded" as const, usageQuantity: null }]
                  : []),
            ],
          },
        ],
      },
    });
    // Recent in-flight attempts remain covered by their launch reservations.
    // Failed/stale receipts cannot be treated as zero when admitting another spend.
    if (unresolved > 0) throw new ProviderUsagePersistenceError();
  }
  const projected =
    used +
    (unit === "cents"
      ? estimate(input.estimatedCostCents, 0)
      : estimate(input.estimatedUsageQuantity, Number.NaN));
  if (used >= cap || projected > cap)
    throw new ProviderAllocationExhaustedError(input.connectionId, input.surface);
  return {
    mode: "allocation" as const,
    remaining: cap - used,
    surface: input.surface,
    unit,
  };
}
