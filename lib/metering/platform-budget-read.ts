import "server-only";
import { type Actor, getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { decimalQuantity } from "@/lib/metering/mapping";
import { platformAllocationTag } from "@/lib/metering/paid-quote";
import { meteringNamespace } from "@/lib/metering/runtime";
import { readSpendingBudgets } from "@/lib/metering/spending-limit-store";
import { platformAllocationEvidence } from "@/lib/provider-ui/allocation-extension";
import type { PlatformAllocationEvidence } from "@/lib/provider-ui/allocation-extension-types";
import { addQuantity, type Budget, type BudgetStatus, resolveWindow } from "@usagekit/core";

export type VerifiedPlatformBudgetBinding = {
  namespace: string;
  principal: string;
  group: string;
  connection: string;
  publicConnection: string;
  provider: string;
  tag: string;
  unit: "customer_cents";
};

type Connection = {
  id: string;
  publicId: string | null;
  provider: string;
  credentialSource?: string;
};

/** Reads metadata and owner-attributed customer charges in one snapshot, never shared tag totals. */
export async function readPlatformConnectionBudgets(input: {
  namespace: string;
  actor: Actor;
  projectId: string;
  connections: readonly Connection[];
}) {
  const selected = input.connections.filter(
    (connection) => connection.credentialSource === "hosted",
  );
  if (
    !selected.length ||
    input.namespace !== meteringNamespace() ||
    !canProjectAction(getProjectRole(input.actor, input.projectId), "read", "billing")
  )
    return [];
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { ownerId: true },
      });
      if (project?.ownerId !== input.actor.id) return [];
      const connections = await tx.providerConnection.findMany({
        where: {
          projectId: input.projectId,
          id: { in: selected.map((connection) => connection.id) },
          credentialSource: "hosted",
        },
        select: {
          id: true,
          publicId: true,
          provider: true,
          projectId: true,
          credentialSource: true,
        },
      });
      const evidence = await platformAllocationEvidence(tx, {
        actor: input.actor,
        projectId: input.projectId,
      });
      const now = new Date();
      const results = [];
      for (const connection of connections) {
        if (
          connection.projectId !== input.projectId ||
          connection.credentialSource !== "hosted" ||
          !isPublicIdOfType(connection.publicId, "conn")
        )
          continue;
        const binding: VerifiedPlatformBudgetBinding = {
          namespace: input.namespace,
          principal: input.actor.id,
          group: input.projectId,
          connection: connection.id,
          publicConnection: connection.publicId,
          provider: connection.provider,
          tag: platformAllocationTag(connection.provider, connection.id),
          unit: "customer_cents",
        };
        const budgets = await readSpendingBudgets(
          tx,
          binding.namespace,
          [{ kind: "tag", namespace: binding.namespace, tag: binding.tag }],
          "read",
        );
        results.push({
          binding,
          budgets: budgets
            .filter((budget) => matches(budget, binding))
            .map((budget) => {
              const proof = evidence.find(
                (entry) => entry.connectionId === connection.id && entry.surface === budget.surface,
              );
              const figures = verifiedFigures(proof);
              const status: BudgetStatus = {
                budget,
                epoch: resolveWindow(budget.window, now),
                // Placeholder counters only project limit metadata; figuresKnown hides them below.
                used: figures?.used ?? decimalQuantity("0", binding.unit, 4),
                reserved: figures?.reserved ?? decimalQuantity("0", binding.unit, 4),
                remaining:
                  figures && budget.limit
                    ? addQuantity(budget.limit, {
                        ...figures.used,
                        value: -figures.used.value - figures.reserved.value,
                      })
                    : null,
              };
              return { status, figuresKnown: figures !== null };
            }),
        });
      }
      return results;
    },
    { isolationLevel: "RepeatableRead" },
  );
}

function matches(budget: Budget, binding: VerifiedPlatformBudgetBinding) {
  return (
    budget.scope.kind === "tag" &&
    budget.scope.namespace === binding.namespace &&
    budget.scope.tag === binding.tag &&
    budget.unit === binding.unit &&
    ["app", "programmatic"].includes(budget.surface) &&
    budget.id === `connection:${binding.connection}:${budget.surface}` &&
    budget.window.kind === "calendar_month" &&
    budget.window.timezone === "UTC"
  );
}

function verifiedFigures(evidence: PlatformAllocationEvidence | undefined) {
  if (
    !evidence ||
    evidence.used === "unavailable" ||
    evidence.reserved === "unavailable" ||
    [evidence.used, evidence.reserved].some(
      (figure) => figure.unit !== "customer_cents" || figure.certainty !== "measured",
    )
  )
    return null;
  try {
    return {
      used: decimalQuantity(evidence.used.text, "customer_cents", 4),
      reserved: decimalQuantity(evidence.reserved.text, "customer_cents", 4),
    };
  } catch {
    return null;
  }
}
