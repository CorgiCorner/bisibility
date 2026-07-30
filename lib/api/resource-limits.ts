import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import { envInt } from "./ratelimit";

export class KeywordLimitExceededError extends Error {
  constructor(readonly limit: number) {
    const noun = limit === 1 ? "keyword" : "keywords";
    super(`This project is limited to ${limit} ${noun}. Delete keywords before adding more.`);
    this.name = "KeywordLimitExceededError";
  }
}

export class ProjectLimitExceededError extends Error {
  constructor(readonly limit: number) {
    const noun = limit === 1 ? "project" : "projects";
    super(`This account is limited to ${limit} ${noun}. Delete a project before creating another.`);
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
  const limit = envInt("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", 0);
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
    throw new KeywordLimitExceededError(limit);
  }
}

export async function assertProjectCapacity(
  client: Pick<ResourceCountClient, "$executeRaw" | "project">,
  ownerId: string,
) {
  const limit = envInt("BISIBILITY_MAX_PROJECTS_PER_USER", 0);
  if (limit <= 0) return;

  await lockCapacity(client, "project", ownerId);
  const currentCount = await client.project.count({ where: { isSample: false, ownerId } });
  if (currentCount >= limit) {
    throw new ProjectLimitExceededError(limit);
  }
}
