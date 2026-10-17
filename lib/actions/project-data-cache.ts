"use server";
import { createHash } from "node:crypto";
import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import {
  cacheDeleteSchema,
  cacheListSchema,
  cacheSettingsSchema,
} from "@/lib/project-data-cache/schema";
import { listProjectDataCache, removeProjectDataCache } from "@/lib/project-data-cache/store";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";

async function scope(projectId: string, action: "read" | "update") {
  const actor = await getActionActor();
  return {
    actor,
    project: await requireProjectScope(actor, action, projectId, { type: "project" }),
  };
}
export async function readProjectDataCache(input: unknown) {
  const data = cacheListSchema.parse(input);
  const access = await scope(data.projectId, "read");
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: access.project.id },
    select: {
      lookupCacheTtlSeconds: true,
      providerConnections: { select: { id: true, provider: true } },
    },
  });
  const labels = Object.fromEntries(PROVIDER_CATALOG.map((p) => [p.id, p.label]));
  const providers = {
    ...labels,
    ...Object.fromEntries(
      project.providerConnections.map((c) => [c.id, labels[c.provider] ?? c.provider]),
    ),
  };
  return {
    ttlSeconds: project.lookupCacheTtlSeconds,
    page: await listProjectDataCache(
      access.project.id,
      data.cursor,
      project.lookupCacheTtlSeconds,
      providers,
    ),
  };
}
export async function saveProjectDataCache(input: unknown) {
  const data = cacheSettingsSchema.parse(input);
  const access = await scope(data.projectId, "update");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.project.updateMany({
      where: { id: access.project.id, lookupCacheTtlSeconds: data.expectedTtlSeconds },
      data: { lookupCacheTtlSeconds: data.ttlSeconds },
    });
    if (updated.count !== 1) return { kind: "conflict" as const };
    await writeAudit(
      {
        actorId: access.actor.id,
        projectId: access.project.id,
        targetId: access.project.publicId,
        targetType: "project",
        action: "settings.data_cache.update",
        before: { ttlSeconds: data.expectedTtlSeconds },
        after: { ttlSeconds: data.ttlSeconds },
      },
      tx,
    );
    return { kind: "saved" as const, ttlSeconds: data.ttlSeconds };
  });
}
export async function deleteProjectDataCache(input: unknown) {
  const data = cacheDeleteSchema.parse(input);
  const access = await scope(data.projectId, "update");
  const kind = await removeProjectDataCache(access.project.id, data.token);
  if (kind === "removed")
    await writeAudit({
      actorId: access.actor.id,
      projectId: access.project.id,
      targetId: access.project.publicId,
      targetType: "project",
      after: { entryDigest: createHash("sha256").update(data.token).digest("hex") },
      action: "settings.data_cache.delete",
    });
  return { kind };
}
