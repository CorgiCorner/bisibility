import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { dollarsToCents } from "@/lib/format/currency";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { credentialsFromInput } from "@/lib/providers/credentials-input";
import { decryptProviderCredentials, encryptSecret } from "@/lib/providers/crypto";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import {
  connectProviderSchema,
  type ProviderConnectionRefInput,
  providerConnectionRefSchema,
} from "@/lib/schemas/provider";
import { z } from "zod";
import { auditConnection, auditProviderMutation, type ProviderClient } from "./provider-audit";
import { renumberProviderChain } from "./provider-chain-writer";
import { verifyProviderConnectionBeforeSave } from "./provider-verification";
import { requireApiPublicId } from "./public-id";

const prioritySchema = z.coerce.number().int().min(0).max(1000);

export const connectProviderActionSchema = connectProviderSchema.extend({
  enabled: z.coerce.boolean().default(true),
});
export const providerSettingsSchema = providerConnectionRefSchema.extend({
  enabled: z.coerce.boolean().optional(),
  priority: prioritySchema.optional(),
});

type ConnectProviderInput = z.infer<typeof connectProviderActionSchema>;
type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;
type ProviderMutationContext = {
  actorId: string | null;
  projectId: string;
  projectPublicId?: string;
};
type ProviderMutationClient = ProviderClient &
  Pick<typeof prisma, "$queryRaw" | "project" | "providerConnectionRate">;
function providerCatalogItem(providerId: string) {
  const item = PROVIDER_CATALOG.find((provider) => provider.id === providerId);
  if (!item) throw new Error(`Unknown provider: ${providerId}`);
  return item;
}

export { credentialsFromInput } from "@/lib/providers/credentials-input";

function findConnection(
  projectId: string,
  providerId: string,
  client: Pick<typeof prisma, "providerConnection"> = prisma,
) {
  return client.providerConnection.findUnique({
    where: { projectId_provider: { projectId, provider: providerId } },
  });
}

export async function connectProviderConnection(
  input: ConnectProviderInput,
  context: ProviderMutationContext,
) {
  const item = providerCatalogItem(input.providerId);
  const stored = await findConnection(context.projectId, item.id);
  const credentials = {
    ...decryptProviderCredentials(stored?.credentialsEncrypted),
    ...credentialsFromInput(input),
  };
  await verifyProviderConnectionBeforeSave({
    credentials,
    hasStoredCredentials: Boolean(stored?.credentialsEncrypted),
    projectId: context.projectId,
    provider: item,
  });
  const secret = Object.keys(credentials).length
    ? encryptSecret(JSON.stringify(credentials))
    : undefined;
  const cost = input.costPerCheck === undefined ? null : dollarsToCents(input.costPerCheck);

  const writeConnection = async (client: ProviderMutationClient) => {
    await lockProjectForProviderMutation(client, context.projectId);
    const before = await findConnection(context.projectId, item.id, client);
    if (
      before?.id !== stored?.id ||
      before?.credentialsEncrypted !== stored?.credentialsEncrypted
    ) {
      throw new Error("Provider connection changed during verification. Try again.");
    }
    const connections = await client.providerConnection.findMany({
      select: { priority: true },
      where: { kind: item.kind, projectId: context.projectId },
    });
    const priority =
      before?.priority ??
      (connections.length === 0
        ? 0
        : Math.max(...connections.map((connection) => connection.priority)) + 1);
    const enabled = priority === 0 || input.enabled;
    const connection = await client.providerConnection.upsert({
      create: {
        costPerCheckCents: cost,
        credentialsEncrypted: secret ?? null,
        enabled,
        kind: item.kind,
        publicId: makePublicId("conn"),
        priority,
        projectId: context.projectId,
        provider: item.id,
        status: "connected",
      },
      update: {
        ...(cost === null ? {} : { costPerCheckCents: cost }),
        enabled,
        ...(secret ? { credentialsEncrypted: secret } : {}),
        ...(before?.publicId ? {} : { publicId: makePublicId("conn") }),
        priority,
        status: "connected",
      },
      where: { projectId_provider: { projectId: context.projectId, provider: item.id } },
    });
    if (cost !== null) {
      await client.providerConnectionRate.upsert({
        create: {
          amountCents: cost,
          connectionId: connection.id,
          feature: "rank_check",
        },
        update: { amountCents: cost },
        where: {
          connectionId_feature: {
            connectionId: connection.id,
            feature: "rank_check",
          },
        },
      });
    }
    await auditProviderMutation(
      {
        action: before ? "provider.update" : "provider.connect",
        actorId: context.actorId,
        after: auditConnection(connection),
        before: before ? auditConnection(before) : null,
        projectId: context.projectId,
        targetId: requireApiPublicId(connection.publicId ?? "", "conn"),
      },
      client,
    );
    return connection;
  };

  return prisma.$transaction(writeConnection);
}

export async function setProviderSettings(
  input: ProviderSettingsInput,
  context: ProviderMutationContext,
) {
  const item = providerCatalogItem(input.providerId);
  return prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, context.projectId);
    const before = await findConnection(context.projectId, item.id, tx);
    if (!before) throw new Error("Provider connection not found.");
    const updated = await tx.providerConnection.update({
      data: {
        ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
        ...(typeof input.priority === "number" ? { priority: input.priority } : {}),
      },
      where: { id: before.id },
    });
    if (input.priority === 0) {
      await renumberProviderChain(context.projectId, item.kind, item.id, tx);
    }
    await auditProviderMutation(
      {
        action: "provider.set_settings",
        actorId: context.actorId,
        after: auditConnection(updated),
        before: auditConnection(before),
        projectId: context.projectId,
        targetId: requireApiPublicId(updated.publicId ?? "", "conn"),
      },
      tx,
    );
    return updated;
  });
}

export async function disconnectProviderConnection(
  input: ProviderConnectionRefInput,
  context: ProviderMutationContext,
) {
  const item = providerCatalogItem(input.providerId);
  const removed = await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, context.projectId);
    const before = await findConnection(context.projectId, item.id, tx);
    if (!before) return false;
    await tx.providerConnection.delete({ where: { id: before.id } });
    await auditProviderMutation(
      {
        action: "provider.disconnect",
        actorId: context.actorId,
        after: { provider: item.id, status: "removed" },
        before: auditConnection(before),
        projectId: context.projectId,
        targetId: requireApiPublicId(before.publicId ?? "", "conn"),
      },
      tx,
    );
    return true;
  });

  return removed ? { ok: true } : null;
}
