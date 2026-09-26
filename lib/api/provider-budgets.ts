import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveEffectiveAllocations } from "@/lib/provider-allocations/compatibility";
import { setProviderConnectionAllocation } from "@/lib/provider-allocations/service";
import {
  MAX_ALLOCATION_AMOUNT,
  type ProviderConnectionAllocationUpdate,
} from "@/lib/provider-allocations/types";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { providerChainOrderBy } from "@/lib/rank-check/provider-chain-order";
import { z } from "zod";
import { type ApiContext, apiMutationContext } from "./context";
import { ApiNotFoundError } from "./errors";
import { requireApiPublicId } from "./public-id";
import { listResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

const connectionSelect = {
  allocationAmountPerMonth: true,
  allocationUnit: true,
  credentialSource: true,
  creditsAllocationAmountPerMonth: true,
  creditsProgrammaticAllocationAmountPerMonth: true,
  enabled: true,
  id: true,
  priority: true,
  programmaticAllocationAmountPerMonth: true,
  provider: true,
  publicId: true,
  status: true,
} as const;

const amountPerMonth = z.number().int().min(1).max(MAX_ALLOCATION_AMOUNT);
const ownBudget = z
  .object({ amountPerMonth, unit: z.enum(["cents", "units"]) })
  .strict()
  .nullable();
const creditsBudget = z
  .object({ amountPerMonth, unit: z.literal("cents") })
  .strict()
  .nullable();

/** Omitted fields keep their stored budget; null clears it. */
const providerBudgetsPatchSchema = z
  .object({
    credits: z
      .object({ app: creditsBudget.optional(), programmatic: creditsBudget.optional() })
      .strict()
      .optional(),
    own: z
      .object({ app: ownBudget.optional(), programmatic: ownBudget.optional() })
      .strict()
      .optional(),
  })
  .strict();

function isBillable(provider: string) {
  return PROVIDER_CATALOG.find((entry) => entry.id === provider)?.allocation?.kind === "billable";
}

async function loadProviderBudgets(projectId: string) {
  const project = await prisma.project.findUnique({
    select: {
      budgetCapCents: true,
      providerAllocationsInitializedAt: true,
      providerConnections: { orderBy: providerChainOrderBy(), select: connectionSelect },
    },
    where: { id: projectId },
  });
  if (!project) throw new Error("Project not found.");
  const connections = project.providerConnections.filter((connection) =>
    isBillable(connection.provider),
  );
  const resolved = new Map(
    resolveEffectiveAllocations({ catalog: PROVIDER_CATALOG, connections, project }).map(
      (allocation) => [allocation.internalConnectionId, allocation],
    ),
  );
  return connections.map((connection) => {
    const allocation = resolved.get(connection.id);
    return {
      connectionId: requireApiPublicId(connection.publicId, "conn"),
      credentialSource: connection.credentialSource,
      credits: {
        app: allocation?.credits.app ?? null,
        programmatic: allocation?.credits.programmatic ?? null,
      },
      own: {
        app: allocation?.allocation ?? null,
        programmatic: allocation?.programmaticAllocation ?? null,
      },
      provider: connection.provider,
      source: allocation?.source ?? "none",
    };
  });
}

function allocationUpdate(
  patch: z.infer<typeof providerBudgetsPatchSchema>,
): ProviderConnectionAllocationUpdate {
  return {
    ...(patch.own?.app !== undefined ? { app: patch.own.app } : {}),
    ...(patch.own?.programmatic !== undefined ? { programmatic: patch.own.programmatic } : {}),
    ...(patch.credits
      ? {
          credits: {
            ...(patch.credits.app !== undefined ? { app: patch.credits.app } : {}),
            ...(patch.credits.programmatic !== undefined
              ? { programmatic: patch.credits.programmatic }
              : {}),
          },
        }
      : {}),
  };
}

/** Own-keys and credits budgets of every billable connection in the project. */
export async function listProviderBudgets(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const budgets = await runDomain(() => loadProviderBudgets(ctx.auth.project.id));
  return listResponse(budgets.map(snakeizeKeys), null, { headers: ctx.headers });
}

export async function updateProviderBudgets(
  ctx: ApiContext,
  projectId: string,
  providerId: string,
) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const patch = parseApiInput(providerBudgetsPatchSchema, objectBody(body));
  const { actor, auditActorId } = apiMutationContext(ctx);
  const budgets = await runDomain(async () => {
    const connection = await prisma.providerConnection.findUnique({
      select: { publicId: true },
      where: { projectId_provider: { projectId: ctx.auth.project.id, provider: providerId } },
    });
    if (!connection?.publicId || !isBillable(providerId)) {
      throw new ApiNotFoundError("Provider connection not found.");
    }
    await setProviderConnectionAllocation({
      actor,
      allocations: allocationUpdate(patch),
      auditActorId,
      catalog: PROVIDER_CATALOG,
      connectionPublicId: connection.publicId,
      projectPublicId: ctx.auth.project.publicId,
    });
    return loadProviderBudgets(ctx.auth.project.id);
  });
  const updated = budgets.find((budget) => budget.provider === providerId);
  if (!updated) throw new ApiNotFoundError("Provider connection not found.");
  return resourceResponse(snakeizeKeys(updated), { headers: ctx.headers });
}
