import "server-only";

import { requireApiPublicId } from "@/lib/api/public-id";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { CloudImportJob, CloudImportState, Prisma } from "@/lib/generated/prisma/client";
import { DEFAULT_STALE_IMPORT_JOB_MINUTES } from "@/lib/migration/stale-jobs";
import { writeMigrationTokenConsumeAudit } from "./audit";

export type VerifiedMigrationToken = {
  createdById?: string | null;
  id: string;
  projectId: string;
  projectPublicId: string;
  publicId: string;
  singleUse?: boolean;
};

export type Project = NonNullable<Awaited<ReturnType<typeof loadProject>>>;
export type JobClient = Pick<Prisma.TransactionClient, "cloudImportJob">;

// Every token-denial path MUST throw this class - the import route maps it to 419; anything else becomes a 500.
export class CloudImportTokenError extends Error {}

export const SELF_IMPORT_DETAIL =
  "This package was exported from the destination project itself. Import it into a different project or instance.";

export class SelfImportError extends Error {
  readonly code = "self_import";
  readonly status = 409;

  constructor() {
    super(SELF_IMPORT_DETAIL);
    this.name = "SelfImportError";
  }
}

// The export package carries the source project's public id; a match with the
// destination project means the package is being imported into itself.
export function assertNotSelfImport(
  project: { id: string; publicId: string },
  sourceProjectId: string | null | undefined,
) {
  if (sourceProjectId && sourceProjectId === project.publicId) {
    throw new SelfImportError();
  }
}

export const transitions = {
  done: [],
  failed: [],
  idle: ["receiving", "failed"],
  importing: ["done", "failed"],
  receiving: ["importing", "failed"],
} satisfies Record<CloudImportState, readonly CloudImportState[]>;

export function canTransition(from: CloudImportState, to: CloudImportState) {
  return (transitions[from] as readonly CloudImportState[]).includes(to);
}

export function loadProject(projectId: string) {
  return prisma.project.findUnique({
    select: {
      createdAt: true,
      domain: true,
      id: true,
      name: true,
      ownerId: true,
      publicId: true,
      updatedAt: true,
      writeMode: true,
      writeModeChangedAt: true,
    },
    where: { id: projectId },
  });
}

function staleReceivingCutoff() {
  return new Date(Date.now() - DEFAULT_STALE_IMPORT_JOB_MINUTES * 60_000);
}

export async function beginJob(token: VerifiedMigrationToken, client: JobClient = prisma) {
  const receiving = { progress: 1, startedAt: new Date(), state: "receiving" as const };
  const existing = await client.cloudImportJob.findFirst({
    orderBy: { createdAt: "desc" },
    where: {
      OR: [{ state: "idle" }, { state: "receiving", updatedAt: { lt: staleReceivingCutoff() } }],
      projectId: token.projectId,
      tokenId: token.id,
    },
  });

  return existing
    ? client.cloudImportJob.update({
        data: {
          ...receiving,
          ...(existing.publicId ? {} : { publicId: makePublicId("imp") }),
        },
        where: { id: existing.id },
      })
    : client.cloudImportJob.create({
        data: {
          ...receiving,
          projectId: token.projectId,
          publicId: makePublicId("imp"),
          tokenId: token.id,
        },
      });
}

export function advanceJob(
  jobId: string,
  state: "done" | "failed" | "importing",
  progress: number,
  counts?: Record<string, number>,
  error?: string,
  client: JobClient = prisma,
) {
  return client.cloudImportJob.update({
    data: {
      counts,
      error: state === "failed" ? (error ?? "Instance import failed.") : null,
      finishedAt: state === "done" || state === "failed" ? new Date() : null,
      progress,
      state,
    },
    where: { id: jobId },
  });
}

export async function consumeMigrationToken(
  token: VerifiedMigrationToken,
  client: Prisma.TransactionClient,
) {
  if (!token.singleUse) return null;
  const consumedAt = new Date();
  const updated = await client.migrationToken.updateMany({
    data: { consumedAt },
    where: { consumedAt: null, id: token.id },
  });
  if (updated.count !== 1) throw new CloudImportTokenError("Migration token was already used.");
  await writeMigrationTokenConsumeAudit(token, consumedAt, client);
  return consumedAt;
}

export function jobView(job: CloudImportJob) {
  return {
    counts: job.counts,
    createdAt: job.createdAt.toISOString(),
    error: job.error,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    id: requireApiPublicId(job.publicId ?? "", "imp"),
    progress: job.progress,
    startedAt: job.startedAt?.toISOString() ?? null,
    state: job.state,
  };
}
