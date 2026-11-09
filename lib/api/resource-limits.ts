import "server-only";

import { CapacityLimitError } from "@/lib/capacity/errors";
import { positiveIntFromEnv } from "@/lib/env/positive-int";
import type { Prisma } from "@/lib/generated/prisma/client";

export class KeywordLimitExceededError extends CapacityLimitError {
  constructor(limit: number, used = limit, requested = 1) {
    const noun = limit === 1 ? "keyword" : "keywords";
    super(
      { dimension: "keywordsPerProject", limit, used, requested, scope: "project" },
      `This project is limited to ${limit} ${noun}. Delete keywords before adding more.`,
    );
    this.name = "KeywordLimitExceededError";
  }
}

export class ProjectLimitExceededError extends CapacityLimitError {
  constructor(limit: number, used = limit, requested = 1) {
    const noun = limit === 1 ? "project" : "projects";
    super(
      { dimension: "projects", limit, used, requested, scope: "account" },
      `This account is limited to ${limit} ${noun}. Delete a project before creating another.`,
    );
    this.name = "ProjectLimitExceededError";
  }
}

type ResourceCountClient = Pick<Prisma.TransactionClient, "$executeRaw" | "keyword" | "project">;

async function lockCapacity(
  client: Pick<ResourceCountClient, "$executeRaw">,
  namespace: "keyword" | "project",
  ownerId: string,
) {
  const lockKey = `${namespace}-capacity:${ownerId}`;
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}

export async function lockKeywordCapacity(
  client: Pick<ResourceCountClient, "$executeRaw">,
  projectId: string,
) {
  const limit = positiveIntFromEnv(process.env.BISIBILITY_MAX_KEYWORDS_PER_PROJECT, 0);
  await lockCapacity(client, "keyword", projectId);
  return limit;
}

export async function assertKeywordCapacity(
  client: Pick<ResourceCountClient, "keyword">,
  projectId: string,
  netNewCount: number,
  limit: number,
) {
  if (limit <= 0 || netNewCount <= 0) return;
  const currentCount = await client.keyword.count({ where: { projectId } });
  if (currentCount + netNewCount > limit) {
    throw new KeywordLimitExceededError(limit, currentCount, netNewCount);
  }
}

/**
 * The owner's project limit when they already own that many projects, else `null`.
 * Counts exactly what `assertProjectCapacity` counts, so the UI blocks creation only when
 * the server would refuse it.
 */
export async function readReachedProjectLimit(
  client: Pick<ResourceCountClient, "project">,
  ownerId: string,
): Promise<number | null> {
  const limit = positiveIntFromEnv(process.env.BISIBILITY_MAX_PROJECTS_PER_USER, 0);
  if (limit <= 0) return null;
  const currentCount = await client.project.count({ where: { isSample: false, ownerId } });
  return currentCount >= limit ? limit : null;
}

export async function assertProjectCapacity(
  client: Pick<ResourceCountClient, "$executeRaw" | "project">,
  ownerId: string,
) {
  const limit = positiveIntFromEnv(process.env.BISIBILITY_MAX_PROJECTS_PER_USER, 0);
  if (limit <= 0) return;

  await lockCapacity(client, "project", ownerId);
  const currentCount = await client.project.count({ where: { isSample: false, ownerId } });
  if (currentCount >= limit) {
    throw new ProjectLimitExceededError(limit, currentCount);
  }
}
