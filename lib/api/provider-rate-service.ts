import "server-only";

import { prisma } from "@/lib/db/prisma";
import { dollarsToCents } from "@/lib/format/currency";
import { providerRateFeatures } from "@/lib/provider-rates/catalog";
import type { UpdateProviderCostInput, UpdateProviderRateInput } from "@/lib/schemas/provider";
import { auditConnection, auditProviderMutation } from "./provider-audit";
import { requireApiPublicId } from "./public-id";

type ProviderMutationContext = {
  actorId: string | null;
  projectId: string;
};

function findConnection(projectId: string, providerId: string) {
  return prisma.providerConnection.findUnique({
    where: { projectId_provider: { projectId, provider: providerId } },
  });
}

export async function updateProviderCostConnection(
  input: UpdateProviderCostInput,
  context: ProviderMutationContext,
) {
  const before = await findConnection(context.projectId, input.providerId);
  if (!before) {
    throw new Error("Provider connection not found.");
  }

  const amountCents = dollarsToCents(input.costPerCheck);
  return prisma.$transaction(async (tx) => {
    const connection = await tx.providerConnection.update({
      data: { costPerCheckCents: amountCents },
      where: { id: before.id },
    });
    await tx.providerConnectionRate.upsert({
      create: {
        amountCents,
        connectionId: connection.id,
        feature: "rank_check",
      },
      update: { amountCents },
      where: {
        connectionId_feature: {
          connectionId: connection.id,
          feature: "rank_check",
        },
      },
    });
    await auditProviderMutation(
      {
        action: "provider.update_cost",
        actorId: context.actorId,
        after: auditConnection(connection),
        before: auditConnection(before),
        projectId: context.projectId,
        targetId: requireApiPublicId(connection.publicId ?? "", "conn"),
      },
      tx,
    );
    return connection;
  });
}

export async function updateProviderConnectionRate(
  input: UpdateProviderRateInput,
  context: ProviderMutationContext,
) {
  if (!providerRateFeatures(input.providerId).includes(input.feature)) {
    throw new Error("Provider does not support this billable feature.");
  }
  const connection = await findConnection(context.projectId, input.providerId);
  if (!connection) {
    throw new Error("Provider connection not found.");
  }
  const before = await prisma.providerConnectionRate.findUnique({
    where: {
      connectionId_feature: {
        connectionId: connection.id,
        feature: input.feature,
      },
    },
  });
  const amountCents = input.costPerUnit === null ? null : dollarsToCents(input.costPerUnit);

  return prisma.$transaction(async (tx) => {
    let rate = null;
    if (amountCents === null) {
      await tx.providerConnectionRate.deleteMany({
        where: { connectionId: connection.id, feature: input.feature },
      });
    } else {
      rate = await tx.providerConnectionRate.upsert({
        create: {
          amountCents,
          connectionId: connection.id,
          feature: input.feature,
        },
        update: { amountCents },
        where: {
          connectionId_feature: {
            connectionId: connection.id,
            feature: input.feature,
          },
        },
      });
    }

    if (input.feature === "rank_check") {
      await tx.providerConnection.update({
        data: { costPerCheckCents: amountCents },
        where: { id: connection.id },
      });
    }

    await auditProviderMutation(
      {
        action: "provider.update_rate",
        actorId: context.actorId,
        after: {
          amountCents,
          feature: input.feature,
          provider: input.providerId,
        },
        before: before
          ? {
              amountCents: Number(before.amountCents),
              feature: before.feature,
              provider: input.providerId,
            }
          : null,
        projectId: context.projectId,
        targetId: requireApiPublicId(connection.publicId ?? "", "conn"),
      },
      tx,
    );
    return rate;
  });
}
