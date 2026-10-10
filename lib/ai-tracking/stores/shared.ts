import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
export type TrackingTransaction = Prisma.TransactionClient;
export { prisma };

export async function lockTrackingProject(tx: TrackingTransaction, projectId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 0))::text`,
  );
  requireFound(
    await tx.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    "Project",
  );
}

export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function requireFound<T>(value: T | null, resource: string): T {
  if (!value) throw new Error(`${resource} not found.`);
  return value;
}

export function activeTrackingPromptWhere(projectId: string): Prisma.AiPromptWhereInput {
  return {
    projectId,
    archivedAt: null,
    pausedAt: null,
    OR: [{ topicId: null }, { topic: { is: { archivedAt: null, pausedAt: null } } }],
  };
}
