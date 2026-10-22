import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import { platformAllocationTag } from "@/lib/metering/paid-quote";
import {
  parseProjectFundingBudgetId,
  projectFundingTag,
} from "@/lib/metering/project-funding-budgets";
import { meteringNamespace } from "@/lib/metering/runtime";
import { currentBudgets, status } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { ownAllocationTag } from "./credential-version";
import type { ProviderRequestSurface } from "./surface";

export { ProviderAllocationExhaustedError } from "@/lib/metering/admission-errors";
export type EnforcementClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "project" | "providerConnection"
>;
type Input = {
  catalog: readonly ProviderCatalogEntry[];
  connectionId: string;
  estimatedCostCents: number;
  /** Customer charge for a project Credits budget. Provider cost is the fallback. */
  estimatedCustomerCents?: number;
  estimatedUsageQuantity?: number;
  now?: Date;
  projectId: string;
  provider: string;
  surface: ProviderRequestSurface;
};
const amount = (q: { value: bigint; scale: number } | null) =>
  q ? Number(q.value) / 10 ** q.scale : null;

/** Advisory Store read only. The paid transport must still reserve atomically through Meter. */
export async function assertProviderAllocationAvailable(
  input: Input,
  db: EnforcementClient | PrismaClient,
) {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { ownerId: true },
  });
  const connection = await db.providerConnection.findFirst({
    where: { id: input.connectionId, projectId: input.projectId, provider: input.provider },
    select: { credentialSource: true },
  });
  if (!project || !connection) throw new Error("Provider connection not found.");
  const namespace = meteringNamespace();
  const tag =
    connection.credentialSource === "hosted"
      ? platformAllocationTag(input.provider, input.connectionId)
      : ownAllocationTag(input.provider, input.connectionId);
  const sql = createSql(db as Prisma.TransactionClient, {
    statements: 0,
    changes: 0n,
    rowsRead: 0,
  });
  const budgets = await currentBudgets(
    sql,
    namespace,
    [
      { kind: "group", namespace, group: input.projectId },
      { kind: "principal", namespace, principal: project.ownerId },
      { kind: "connection", namespace, connection: input.connectionId },
      { kind: "tag", namespace, tag },
      {
        kind: "tag",
        namespace,
        tag: projectFundingTag(
          connection.credentialSource === "hosted" ? "platform" : "byok",
          input.projectId,
        ),
      },
    ],
    input.surface,
  );
  let remaining: number | null = null;
  let unit: "cents" | "units" | null = null;
  for (const budget of budgets) {
    if (budget.onExceed !== "block" || budget.limit === null) continue;
    const value =
      budget.unit === "paid_attempts"
        ? 1
        : budget.unit === "units"
          ? input.estimatedUsageQuantity
          : budget.unit === "customer_cents" && input.estimatedCustomerCents !== undefined
            ? input.estimatedCustomerCents
            : input.estimatedCostCents;
    if (value === undefined || !Number.isFinite(value) || value < 0)
      throw new Error("Provider usage estimate is invalid.");
    const current = await status(sql, budget, input.now ?? new Date());
    const available = amount(current.remaining);
    if (available !== null && value > available) {
      const resetAt = current.epoch?.endsAt ? new Date(current.epoch.endsAt) : null;
      const funding = parseProjectFundingBudgetId(budget.id);
      if (budget.scope.kind === "group" || funding)
        throw new BudgetExhaustedError({
          projectId: input.projectId,
          ...(funding ? { fundingSource: funding.fundingSource } : {}),
          capCents: amount(budget.limit) ?? 0,
          spentCents: amount(current.used) ?? 0,
          reservedCents: amount(current.reserved) ?? 0,
          resetAt,
        });
      throw new ProviderAllocationExhaustedError(input.connectionId, input.surface, resetAt);
    }
    if (
      budget.scope.kind !== "group" &&
      !parseProjectFundingBudgetId(budget.id) &&
      budget.unit !== "paid_attempts"
    ) {
      remaining = remaining === null ? available : Math.min(remaining, available ?? Infinity);
      unit = budget.unit === "units" ? "units" : "cents";
    }
  }
  return { mode: "allocation" as const, remaining, unit, surface: input.surface };
}
