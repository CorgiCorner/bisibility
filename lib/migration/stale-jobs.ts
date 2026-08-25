import "server-only";

import { prisma } from "@/lib/db/prisma";
import { PROJECT_WRITE_MODE_MIGRATION_HOLD } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { releaseMigrationHoldsForProjects } from "./stale-holds";

export const IMPORT_TIMED_OUT_ERROR = "Import timed out.";
export const DEFAULT_STALE_IMPORT_JOB_MINUTES = 30;

export type MarkStaleImportJobsOptions = {
  olderThanMinutes?: number;
  projectId?: string;
};

function staleWindowMinutes(input?: number) {
  if (input === undefined) {
    return DEFAULT_STALE_IMPORT_JOB_MINUTES;
  }
  if (!Number.isFinite(input) || input <= 0) {
    throw new Error("olderThanMinutes must be a positive finite number.");
  }
  return input;
}

function staleJobWhere(
  projectId: string | undefined,
  cutoff: Date,
): Prisma.CloudImportJobWhereInput {
  return {
    ...(projectId ? { projectId } : {}),
    OR: [
      { state: { in: ["receiving" as const, "importing" as const] } },
      { project: { writeMode: PROJECT_WRITE_MODE_MIGRATION_HOLD }, state: "idle" as const },
    ],
    updatedAt: { lt: cutoff },
  };
}

export async function markStaleImportJobs(
  options: MarkStaleImportJobsOptions = {},
): Promise<number> {
  const olderThanMinutes = staleWindowMinutes(options.olderThanMinutes);
  const now = new Date();
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000);
  const where = staleJobWhere(options.projectId, cutoff);
  const candidate = await prisma.cloudImportJob.findFirst({ select: { id: true }, where });
  if (!candidate) return 0;
  return prisma.$transaction(async (tx) => {
    const jobs = await tx.cloudImportJob.updateManyAndReturn({
      data: { error: IMPORT_TIMED_OUT_ERROR, finishedAt: now, state: "failed" },
      select: { id: true, projectId: true },
      where,
    });
    if (jobs.length === 0) return 0;
    const jobIds = jobs.map((job) => job.id);
    const projectIds = [...new Set(jobs.map((job) => job.projectId))];
    await tx.migrationImportChunk.deleteMany({ where: { jobId: { in: jobIds } } });
    const projects = await tx.project.findMany({
      select: { id: true, publicId: true, writeMode: true, writeModeChangedAt: true },
      where: { id: { in: projectIds }, writeMode: PROJECT_WRITE_MODE_MIGRATION_HOLD },
    });
    await releaseMigrationHoldsForProjects(
      projects,
      now,
      "project.migration_hold.stale_job_release",
      tx,
    );
    return jobs.length;
  });
}
