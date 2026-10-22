import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { formatQuantity } from "@usagekit/core";
import { platformAllocationTag } from "./paid-quote";
import { meteringNamespace } from "./runtime";
import { currentBudgets, status } from "./store/budgets";
import { createSql } from "./store/host-sql";

type Client = Pick<Prisma.TransactionClient, "$queryRaw" | "project" | "providerConnection">;
/** Advisory only: an allowed preview never grants a paid transport capability. */
export async function advisoryProviderBudget(
  input: {
    connectionId: string;
    projectId: string;
    provider: string;
    estimatedCostCents: number;
    estimatedCustomerCents?: number;
    estimatedUsageQuantity?: number;
    surface: ProviderRequestSurface;
  },
  client: Client,
) {
  const [project, connection] = await Promise.all([
    client.project.findUnique({ where: { id: input.projectId }, select: { ownerId: true } }),
    client.providerConnection.findFirst({
      where: { id: input.connectionId, projectId: input.projectId, provider: input.provider },
      select: { credentialSource: true },
    }),
  ]);
  if (!project || !connection) throw new ProviderUsagePersistenceError();
  const namespace = meteringNamespace();
  const hosted = connection.credentialSource === "hosted";
  const tag = (hosted ? platformAllocationTag : ownAllocationTag)(
    input.provider,
    input.connectionId,
  );
  const sql = createSql(client as Prisma.TransactionClient, {
    statements: 0,
    changes: 0n,
    rowsRead: 0,
  });
  const budgets = await currentBudgets(
    sql,
    namespace,
    [
      { kind: "principal", namespace, principal: project.ownerId },
      { kind: "group", namespace, group: input.projectId },
      { kind: "connection", namespace, connection: input.connectionId },
      { kind: "tag", namespace, tag },
    ],
    input.surface,
  );
  for (const budget of budgets) {
    if (budget.onExceed !== "block" || budget.limit === null) continue;
    const current = await status(sql, budget, new Date());
    if (!current.remaining) throw new ProviderUsagePersistenceError();
    const remaining = Number(formatQuantity(current.remaining));
    if (remaining <= 0) return true;
    const estimate =
      budget.unit === "paid_attempts"
        ? 1
        : hosted && ["budget_cents", "customer_cents"].includes(budget.unit)
          ? input.estimatedCustomerCents
          : budget.unit === "units"
            ? input.estimatedUsageQuantity
            : budget.unit === "cents" || (!hosted && budget.unit === "budget_cents")
              ? input.estimatedCostCents
              : undefined;
    // Customer money needs the frozen hosted quote; the admission path checks it.
    if (
      hosted &&
      ["budget_cents", "customer_cents"].includes(budget.unit) &&
      input.estimatedCustomerCents === undefined
    )
      continue;
    if (estimate === undefined || !Number.isFinite(estimate) || estimate < 0)
      throw new ProviderUsagePersistenceError();
    if (estimate > remaining) return true;
  }
  return false;
}
