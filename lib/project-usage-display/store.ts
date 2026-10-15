import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { UsageDisplayUnavailableError, usageDisplayProjectScope } from "./access";
import {
  defaultUsageDisplayOptions,
  type ProjectUsageDisplaySettings,
  updateUsageDisplaySchema,
  usageDisplayDocumentSchema,
} from "./schema";

export type UsageDisplayDatabase = Pick<PrismaClient, "$transaction">;
type Scope = Awaited<ReturnType<typeof usageDisplayProjectScope>>;
export class UsageDisplayConflictError extends Error {
  constructor(readonly current: ProjectUsageDisplaySettings) {
    super("Usage display settings changed.");
  }
}
async function readSnapshot(tx: Prisma.TransactionClient, scope: Scope) {
  const row = await tx.project.findUnique({
    where: { id: scope.project.id },
    select: { usageDisplaySettings: true },
  });
  const parsed =
    row?.usageDisplaySettings == null
      ? null
      : usageDisplayDocumentSchema.safeParse(row.usageDisplaySettings);
  if (parsed && !parsed.success) throw new UsageDisplayUnavailableError();
  return {
    projectId: scope.project.publicId,
    options: parsed?.data?.options ?? defaultUsageDisplayOptions,
    revision: parsed?.data?.revision ?? 0,
    canEdit: scope.canEdit,
  } satisfies ProjectUsageDisplaySettings;
}
export async function readProjectUsageDisplaySettings(
  projectId: string,
  actor: Actor | null,
  db: UsageDisplayDatabase = prisma,
) {
  return db.$transaction(
    async (tx) => readSnapshot(tx, await usageDisplayProjectScope(tx, actor, projectId, "read")),
    // Project layout competes with parallel server-render reads. Allow a cold
    // remote connection to acquire a slot while retaining a bounded transaction.
    { maxWait: 10_000, timeout: 15_000 },
  );
}
export async function saveProjectUsageDisplaySettings(
  input: unknown,
  actor: Actor | null,
  db: UsageDisplayDatabase = prisma,
) {
  const data = updateUsageDisplaySchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await usageDisplayProjectScope(tx, actor, data.projectId, "update");
    const before = await readSnapshot(tx, scope);
    if (before.revision !== data.expectedRevision) throw new UsageDisplayConflictError(before);
    const document = usageDisplayDocumentSchema.parse({
      version: 1,
      revision: before.revision + 1,
      options: data.options,
    });
    await tx.project.update({
      where: { id: scope.project.id },
      data: { usageDisplaySettings: document },
    });
    await writeAudit(
      {
        action: "settings.usage_display.update",
        actorId: scope.actor.id,
        projectId: scope.project.id,
        targetId: scope.project.publicId,
        targetType: "project",
        before: { revision: before.revision, ...before.options },
        after: { revision: document.revision, ...document.options },
      },
      tx,
    );
    return { ...before, revision: document.revision, options: document.options };
  });
}
