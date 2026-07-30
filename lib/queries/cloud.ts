import "server-only";

import { prisma } from "@/lib/db/prisma";
import { requirePublicId } from "@/lib/db/public-id";
import type {
  CloudImportState,
  MigrationScope,
  Prisma,
  ProjectWriteMode,
} from "@/lib/generated/prisma/client";
import { markStaleImportJobs } from "@/lib/migration/stale-jobs";
import { requireReadableProject } from "./_auth";

export type CloudTokenView = {
  createdAt: string;
  createdBy: { email: string; name: string };
  expiresAt: string;
  id: string;
  scope: MigrationScope;
  singleUse: boolean;
};

export type CloudImportJobView = {
  counts: Prisma.JsonValue | null;
  createdAt: string | null;
  error: string | null;
  finishedAt: string | null;
  id: string | null;
  progress: number;
  startedAt: string | null;
  state: CloudImportState;
};

export type CloudImportView = {
  activeToken: CloudTokenView | null;
  importJob: CloudImportJobView;
  project: {
    domain: string;
    id: string;
    name: string;
    publicId: string;
    writeMode: ProjectWriteMode;
  };
};

type CloudImportJobRow = {
  counts: Prisma.JsonValue | null;
  createdAt: Date;
  error: string | null;
  finishedAt: Date | null;
  id: string;
  publicId: string | null;
  progress: number;
  startedAt: Date | null;
  state: CloudImportState;
};

function iso(date: Date | null | undefined) {
  return date?.toISOString() ?? null;
}

function serializeJob(job: CloudImportJobRow): CloudImportJobView {
  return {
    counts: job.counts,
    createdAt: job.createdAt.toISOString(),
    error: job.error,
    finishedAt: iso(job.finishedAt),
    id: requirePublicId(job.publicId, "imp"),
    progress: job.progress,
    startedAt: iso(job.startedAt),
    state: job.state,
  };
}

export function idleCloudImportJob(): CloudImportJobView {
  return {
    counts: null,
    createdAt: null,
    error: null,
    finishedAt: null,
    id: null,
    progress: 0,
    startedAt: null,
    state: "idle",
  };
}

export function isNonterminalCloudImportJob(job: CloudImportJobView) {
  return (
    job.id !== null &&
    (job.state === "idle" || job.state === "receiving" || job.state === "importing")
  );
}

async function latestImportJob(projectId: string) {
  return prisma.cloudImportJob.findFirst({
    orderBy: { createdAt: "desc" },
    where: { projectId },
  });
}

async function currentImportJob(projectId: string, now: Date) {
  return prisma.cloudImportJob.findFirst({
    orderBy: { createdAt: "desc" },
    where: {
      OR: [
        { state: { in: ["receiving", "importing"] } },
        {
          state: "idle",
          token: { is: { consumedAt: null, expiresAt: { gt: now } } },
        },
      ],
      projectId,
    },
  });
}

export async function getCloudImportJobStatus(projectId: string): Promise<CloudImportJobView> {
  const { project } = await requireReadableProject(projectId);
  await markStaleImportJobs({ projectId: project.id });
  const job = await latestImportJob(project.id);

  return job ? serializeJob(job) : idleCloudImportJob();
}

export async function getCloudImportView(projectId: string): Promise<CloudImportView> {
  const { project } = await requireReadableProject(projectId);
  const publicProjectId = requirePublicId(project.publicId, "prj");
  await markStaleImportJobs({ projectId: project.id });
  const now = new Date();
  const [activeToken, importJob] = await Promise.all([
    prisma.migrationToken.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        createdBy: { select: { email: true, name: true } },
        expiresAt: true,
        publicId: true,
        scope: true,
        singleUse: true,
      },
      where: { consumedAt: null, expiresAt: { gt: now }, projectId: project.id },
    }),
    currentImportJob(project.id, now),
  ]);

  return {
    activeToken: activeToken
      ? {
          createdAt: activeToken.createdAt.toISOString(),
          createdBy: activeToken.createdBy,
          expiresAt: activeToken.expiresAt.toISOString(),
          id: requirePublicId(activeToken.publicId, "ferry"),
          scope: activeToken.scope,
          singleUse: activeToken.singleUse,
        }
      : null,
    importJob: importJob ? serializeJob(importJob) : idleCloudImportJob(),
    project: {
      domain: project.domain,
      id: publicProjectId,
      name: project.name,
      publicId: publicProjectId,
      writeMode: project.writeMode,
    },
  };
}
