import "server-only";
import { positiveIntFromEnv } from "@/lib/env/positive-int";
import type { Prisma } from "@/lib/generated/prisma/client";
import { CapacityLimitError } from "./errors";
import type { CapacityRequest } from "./types";

export function readEnvironmentCapacity(dimension: string): number | null {
  const raw =
    dimension === "projects"
      ? process.env.BISIBILITY_MAX_PROJECTS_PER_USER
      : dimension === "keywordsPerProject"
        ? process.env.BISIBILITY_MAX_KEYWORDS_PER_PROJECT
        : undefined;
  return positiveIntFromEnv(raw, 0) || null;
}

export async function assertResolvedCapacity(
  tx: Prisma.TransactionClient,
  ownerId: string,
  dimension: string,
  request: CapacityRequest,
  limit: number | null,
  scope: "account" | "project",
) {
  if (!Number.isSafeInteger(request.additional) || request.additional < 0)
    throw new RangeError("Invalid requested capacity.");
  if (limit === null || request.additional === 0) return;
  if (scope === "project" && !request.projectId)
    throw new TypeError("Project capacity requires a project id.");
  const key =
    dimension === "projects"
      ? `project-capacity:${ownerId}`
      : dimension === "keywordsPerProject"
        ? `keyword-capacity:${request.projectId}`
        : `capacity:${dimension}:${scope === "project" ? request.projectId : ownerId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  const used = await request.countUsed(tx);
  if (!Number.isSafeInteger(used) || used < 0) throw new RangeError("Invalid measured capacity.");
  if (used + request.additional > limit)
    throw new CapacityLimitError({
      dimension,
      limit,
      used,
      requested: request.additional,
      scope,
    });
}
