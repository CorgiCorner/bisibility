import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { dollarsToCents } from "@/lib/format/currency";
import {
  credentialsForProviderTest,
  restoreProviderAfterSuccessfulTest,
} from "@/lib/providers/auth-recovery";
import { decryptProviderCredentials, encryptSecret } from "@/lib/providers/crypto";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";
import {
  connectProviderSchema,
  type ProviderConnectionRefInput,
  providerConnectionRefSchema,
  type TestProviderConnectionInput,
} from "@/lib/schemas/provider";
import { z } from "zod";
import { auditConnection, auditProviderMutation, type ProviderClient } from "./provider-audit";
import { renumberProviderChain } from "./provider-chain-writer";
import {
  probeProviderConnection,
  verifyProviderConnectionBeforeSave,
} from "./provider-verification";
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
  Pick<typeof prisma, "$queryRaw" | "providerConnectionRate">;
function providerCatalogItem(providerId: string) {
  const item = PROVIDER_CATALOG.find((provider) => provider.id === providerId);
  if (!item) throw new Error(`Unknown provider: ${providerId}`);
  return item;
}

function credentialsFromInput(input: {
  credentials?: { apiKey?: string; endpoint?: string; login?: string; secret?: string };
  login?: string;
  secret?: string;
}): ProviderCredentials {
  const endpoint = input.credentials?.endpoint;
  const login = input.credentials?.login ?? input.login;
  const secret = input.credentials?.secret ?? input.secret;
  const apiKey = input.credentials?.apiKey ?? (login ? undefined : secret);

  return {
    ...(endpoint ? { endpoint } : {}),
    ...(login ? { login } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(login && secret ? { password: secret } : {}),
  };
}

function findConnection(
  projectId: string,
  providerId: string,
  client: Pick<typeof prisma, "providerConnection"> = prisma,
) {
  return client.providerConnection.findUnique({
    where: { projectId_provider: { projectId, provider: providerId } },
  });
}

async function publicProjectId(context: ProviderMutationContext) {
  if (context.projectPublicId) {
    return requireApiPublicId(context.projectPublicId, "prj");
  }
  const project = await prisma.project.findUnique({
    select: { publicId: true },
    where: { id: context.projectId },
  });
  return requireApiPublicId(project?.publicId ?? "", "prj");
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
  const secret =
    Object.keys(credentials).length > 0 ? encryptSecret(JSON.stringify(credentials)) : undefined;
  const cost = input.costPerCheck === undefined ? null : dollarsToCents(input.costPerCheck);

  const writeConnection = async (client: ProviderMutationClient) => {
    await client.$queryRaw`
      SELECT "id" FROM "projects" WHERE "id" = ${context.projectId} FOR UPDATE
    `;
    const before = await findConnection(context.projectId, item.id, client);
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

export async function testProviderConnection(
  input: TestProviderConnectionInput,
  context: ProviderMutationContext,
) {
  const item = providerCatalogItem(input.providerId);
  const targetId = await publicProjectId(context);

  try {
    const credentials = await credentialsForProviderTest(
      context.projectId,
      item.id,
      credentialsFromInput(input),
    );
    const result = await probeProviderConnection({
      credentials,
      projectId: context.projectId,
      provider: item,
    });
    await restoreProviderAfterSuccessfulTest({
      ok: result.ok,
      projectId: context.projectId,
      providerId: item.id,
      testInput: input,
    });
    await auditProviderMutation({
      action: "provider.test",
      actorId: context.actorId,
      after: { ok: result.ok, provider: item.id },
      projectId: context.projectId,
      targetId,
      targetType: "project",
    });
    return result;
  } catch (error) {
    const result = {
      message: error instanceof Error ? error.message : "Provider connection test failed.",
      ok: false,
    };
    await auditProviderMutation({
      action: "provider.test_failed",
      actorId: context.actorId,
      after: { message: result.message, provider: item.id },
      projectId: context.projectId,
      targetId,
      targetType: "project",
    });
    return result;
  }
}

export async function setProviderSettings(
  input: ProviderSettingsInput,
  context: ProviderMutationContext,
) {
  const item = providerCatalogItem(input.providerId);
  const before = await findConnection(context.projectId, item.id);
  if (!before) {
    throw new Error("Provider connection not found.");
  }

  return prisma.$transaction(async (tx) => {
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
  const before = await findConnection(context.projectId, item.id);
  if (!before) {
    return null;
  }

  await prisma.$transaction(async (tx) => {
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
  });

  return { ok: true };
}
