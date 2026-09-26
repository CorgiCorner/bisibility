"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateBudgetViews,
} from "@/lib/actions/_shared";
import { requireApiPublicId } from "@/lib/api/public-id";
import { setProviderConnectionAllocation } from "@/lib/provider-allocations/service";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { loadProjectProviderSpend } from "@/lib/queries/provider-spend";
import {
  budgetInputToCents,
  type ProviderAllocationInput,
  providerAllocationSchema,
} from "@/lib/schemas/usage-settings";

type ProviderAllocationFormValue = NonNullable<ProviderAllocationInput["allocation"]> | null;

function providerAllocation(
  value: ProviderAllocationFormValue,
): { amountPerMonth: number; unit: "cents" } | { amountPerMonth: number; unit: "units" } | null {
  if (value === null) return null;
  return value.unit === "cents"
    ? {
        amountPerMonth: budgetInputToCents({ budgetDollars: value.amountDollars }),
        unit: "cents" as const,
      }
    : { amountPerMonth: value.amount, unit: "units" as const };
}

export async function updateProviderConnectionAllocationAction(
  projectPublicId: string,
  input: unknown,
) {
  const data = parseActionInput(providerAllocationSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", projectPublicId, {
    type: "provider_connection",
  });

  await setProviderConnectionAllocation({
    actor,
    allocations: {
      ...(data.allocation !== undefined ? { app: providerAllocation(data.allocation) } : {}),
      ...(data.programmaticAllocation !== undefined
        ? { programmatic: providerAllocation(data.programmaticAllocation) }
        : {}),
      ...(data.creditsAllocation !== undefined || data.creditsProgrammaticAllocation !== undefined
        ? {
            credits: {
              ...(data.creditsAllocation !== undefined
                ? { app: providerAllocation(data.creditsAllocation) }
                : {}),
              ...(data.creditsProgrammaticAllocation !== undefined
                ? { programmatic: providerAllocation(data.creditsProgrammaticAllocation) }
                : {}),
            },
          }
        : {}),
    },
    catalog: PROVIDER_CATALOG,
    connectionPublicId: data.connectionId,
    projectPublicId: project.publicId,
  });
  revalidateBudgetViews();

  const providerSpend = await loadProjectProviderSpend({
    catalog: PROVIDER_CATALOG,
    now: new Date(),
    projectId: project.id,
  });
  const connection = providerSpend.connections.find(
    (candidate) => candidate.connectionId === data.connectionId,
  );
  if (!connection) throw new Error("Provider connection not found.");
  return connection;
}

export async function refreshProviderConnectionBudgetAction(
  projectPublicId: string,
  connectionId: string,
) {
  requireApiPublicId(connectionId, "conn");
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", projectPublicId, {
    type: "provider_connection",
  });
  const spend = await loadProjectProviderSpend({
    catalog: PROVIDER_CATALOG,
    now: new Date(),
    projectId: project.id,
    refreshConnectionPublicId: connectionId,
  });
  const connection = spend.connections.find((item) => item.connectionId === connectionId);
  if (!connection) throw new Error("Provider connection not found.");
  return connection;
}
