import "server-only";

import { MAX_WEBHOOK_ENDPOINTS_PER_PROJECT } from "@/lib/alerts/limits";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { encryptSecret } from "@/lib/providers/crypto";
import { ApiInputError } from "./errors";
import { requireApiPublicId } from "./public-id";

const endpointSelect = {
  createdAt: true,
  description: true,
  enabled: true,
  id: true,
  publicId: true,
  lastDeliveryAt: true,
  updatedAt: true,
  url: true,
} as const;

export type WebhookEndpointRecord = {
  createdAt: Date;
  description: string | null;
  enabled: boolean;
  id: string;
  lastDeliveryAt: Date | null;
  updatedAt: Date;
  url: string;
  publicId: string;
};

type MutationScope = {
  actorId: string | null;
  projectId: string;
};

export function listWebhookEndpoints(projectId: string) {
  return prisma.webhookEndpoint.findMany({
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    select: endpointSelect,
    where: { projectId },
  });
}

export function listWebhookEndpointsWithHistory(projectId: string) {
  return prisma.webhookEndpoint.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      ...endpointSelect,
      deliveryAttempts: {
        orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
        select: {
          attemptedAt: true,
          error: true,
          id: true,
          status: true,
          triggeredAlert: {
            select: { rankCheck: { select: { trigger: true } } },
          },
        },
        take: 10,
      },
    },
    where: { projectId },
  });
}

export function findWebhookEndpoint(projectId: string, endpointId: string) {
  return prisma.webhookEndpoint.findFirst({
    select: endpointSelect,
    where: { publicId: endpointId, projectId },
  });
}

export function findWebhookEndpointDeliveryTarget(projectId: string, endpointId: string) {
  return prisma.webhookEndpoint.findFirst({
    select: { enabled: true, hmacSecret: true, id: true, publicId: true, url: true },
    where: { publicId: endpointId, projectId },
  });
}

export async function createWebhookEndpointRecord(
  data: { description: string | null; enabled: boolean; hmacSecret: string; url: string },
  scope: MutationScope,
) {
  const hmacSecret = encryptSecret(data.hmacSecret);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "projects"
      WHERE "id" = ${scope.projectId}
      FOR UPDATE
    `;
    const count = await tx.webhookEndpoint.count({ where: { projectId: scope.projectId } });
    if (count >= MAX_WEBHOOK_ENDPOINTS_PER_PROJECT) {
      throw new ApiInputError(
        `Webhook endpoint limit reached: a project can have at most ${MAX_WEBHOOK_ENDPOINTS_PER_PROJECT} webhook endpoints. Delete an existing endpoint before creating another.`,
      );
    }
    const endpoint = await tx.webhookEndpoint.create({
      data: {
        description: data.description,
        enabled: data.enabled,
        hmacSecret,
        projectId: scope.projectId,
        publicId: makePublicId("we"),
        url: data.url,
      },
      select: endpointSelect,
    });
    await writeAudit(
      {
        action: "webhook_endpoint.create",
        actorId: scope.actorId,
        after: endpoint,
        projectId: scope.projectId,
        targetId: requireApiPublicId(endpoint.publicId, "we"),
        targetType: "webhook_endpoint",
      },
      tx,
    );
    return endpoint;
  });
}

export async function updateWebhookEndpointRecord(
  endpointId: string,
  data: {
    description?: string | null;
    enabled?: boolean;
    hmacSecret?: string | null;
    url?: string;
  },
  scope: MutationScope,
) {
  if (data.hmacSecret === null || data.hmacSecret === "") {
    throw new ApiInputError("Webhook HMAC secret must be a non-empty string when provided.");
  }
  const before = await findWebhookEndpoint(scope.projectId, endpointId);
  if (!before) {
    return null;
  }

  const endpoint = await prisma.webhookEndpoint.update({
    data: {
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.hmacSecret !== undefined ? { hmacSecret: encryptSecret(data.hmacSecret) } : {}),
      ...(data.url !== undefined ? { url: data.url } : {}),
    },
    select: endpointSelect,
    where: { id: before.id },
  });

  await writeAudit({
    action: "webhook_endpoint.update",
    actorId: scope.actorId,
    after: endpoint,
    before,
    projectId: scope.projectId,
    targetId: requireApiPublicId(endpoint.publicId, "we"),
    targetType: "webhook_endpoint",
  });

  return endpoint;
}

export async function deleteWebhookEndpointRecord(endpointId: string, scope: MutationScope) {
  const before = await findWebhookEndpoint(scope.projectId, endpointId);
  if (!before) {
    return null;
  }

  await prisma.webhookEndpoint.delete({ where: { id: before.id } });

  await writeAudit({
    action: "webhook_endpoint.delete",
    actorId: scope.actorId,
    before,
    projectId: scope.projectId,
    targetId: requireApiPublicId(before.publicId ?? "", "we"),
    targetType: "webhook_endpoint",
  });

  return before;
}
