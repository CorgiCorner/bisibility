import "server-only";

import { prisma } from "@/lib/db/prisma";
import { dollarsToCents } from "@/lib/format/currency";
import type { Prisma, ProviderCostFeature } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { providerRateFeatures } from "@/lib/provider-rates/catalog";
import { rankCheckRateSelection, withRankCheckManualRate } from "@/lib/provider-rates/manual-rate";
import { parseNativeRateCents } from "@/lib/provider-ui/form-schema";
import type { UpdateProviderCostInput, UpdateProviderRateInput } from "@/lib/schemas/provider";
import { auditConnection, auditProviderMutation } from "./provider-audit";
import { requireApiPublicId } from "./public-id";

type ProviderMutationContext = {
  actorId: string | null;
  projectId: string;
};

function findConnection(
  projectId: string,
  providerId: string,
  client: Pick<typeof prisma, "providerConnection"> = prisma,
) {
  return client.providerConnection.findUnique({
    include: { rates: rankCheckRateSelection },
    where: { projectId_provider: { projectId, provider: providerId } },
  });
}

export async function updateProviderCostConnection(
  input: UpdateProviderCostInput,
  context: ProviderMutationContext,
) {
  const amountCents = dollarsToCents(input.costPerCheck);
  return prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, context.projectId);
    const before = await findConnection(context.projectId, input.providerId, tx);
    if (!before) throw new Error("Provider connection not found.");
    if (before.credentialSource === "hosted") {
      throw new Error("Hosted provider rates are read-only.");
    }
    const updated = await tx.providerConnection.update({
      data: { updatedAt: new Date() },
      where: { id: before.id },
    });
    await tx.providerConnectionRate.upsert({
      create: {
        amountCents,
        connectionId: updated.id,
        feature: "rank_check",
      },
      update: { amountCents },
      where: {
        connectionId_feature: {
          connectionId: updated.id,
          feature: "rank_check",
        },
      },
    });
    const connection = { ...updated, costPerCheckCents: String(amountCents) };
    await auditProviderMutation(
      {
        action: "provider.update_cost",
        actorId: context.actorId,
        after: auditConnection(connection),
        before: auditConnection(withRankCheckManualRate(before)),
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
  const amountCents = input.costPerUnit === null ? null : dollarsToCents(input.costPerUnit);

  return prisma.$transaction((tx) =>
    updateProviderConnectionRateInTransaction(
      tx,
      {
        amountCents,
        feature: input.feature,
        providerId: input.providerId,
      },
      context,
    ),
  );
}

/** Exact native cents from the validated host UI adapter, in the caller's transaction. */
export async function updateProviderConnectionRateInTransaction(
  tx: Prisma.TransactionClient,
  input: { amountCents: string | number | null; feature: ProviderCostFeature; providerId: string },
  context: ProviderMutationContext,
) {
  if (
    !providerRateFeatures(input.providerId).includes(
      input.feature as UpdateProviderRateInput["feature"],
    )
  ) {
    throw new Error("Provider does not support this billable feature.");
  }
  const normalized =
    input.amountCents === null ? null : parseNativeRateCents(String(input.amountCents));
  if (input.amountCents !== null && normalized === null)
    throw new TypeError("Invalid native rate.");
  // Existing dollar-based callers keep their established numeric contract; the UI supplies exact text.
  const amountCents = typeof input.amountCents === "number" ? input.amountCents : normalized;
  await lockProjectForProviderMutation(tx, context.projectId);
  const connection = await findConnection(context.projectId, input.providerId, tx);
  if (!connection) throw new Error("Provider connection not found.");
  if (connection.credentialSource === "hosted") {
    throw new Error("Hosted provider rates are read-only.");
  }
  const before = await tx.providerConnectionRate.findUnique({
    where: {
      connectionId_feature: { connectionId: connection.id, feature: input.feature },
    },
  });
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

  await tx.providerConnection.update({
    data: { updatedAt: new Date() },
    where: { id: connection.id },
  });

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
            amountCents: before.amountCents.toString(),
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
}
