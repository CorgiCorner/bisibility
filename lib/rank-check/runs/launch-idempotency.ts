import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { RunStatus } from "./contract";

type IdempotencyClient =
  | Pick<typeof prisma, "rankCheckRun">
  | Pick<Prisma.TransactionClient, "rankCheckRun">;

export function apiIdempotencyKey(value: string | undefined) {
  return value ? `api:${value}` : undefined;
}

export async function findIdempotentRun(
  projectId: string,
  idempotencyKey: string | undefined,
  client: IdempotencyClient = prisma,
) {
  if (!idempotencyKey) return null;
  const existing = await client.rankCheckRun.findUnique({
    select: {
      estimatedCostCents: true,
      keywordCount: true,
      publicId: true,
      status: true,
      targetCount: true,
    },
    where: { projectId_idempotencyKey: { idempotencyKey, projectId } },
  });
  return existing ? { ...existing, status: existing.status as RunStatus } : null;
}

export function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}
