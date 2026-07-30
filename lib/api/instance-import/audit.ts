import "server-only";

import { type AuditClient, writeAudit } from "@/lib/auth/audit";
import { requirePublicId } from "@/lib/db/public-id";
import type { CloudImportJob } from "@/lib/generated/prisma/client";
import type { VerifiedMigrationToken } from "./jobs";

function actorId(token: VerifiedMigrationToken) {
  return token.createdById ?? null;
}

function jobId(job: CloudImportJob) {
  return requirePublicId(job.publicId, "imp");
}

export function writeCloudImportBeginAudit(
  token: VerifiedMigrationToken,
  job: CloudImportJob,
  client?: AuditClient,
) {
  const targetId = jobId(job);
  return writeAudit(
    {
      action: "cloud_import.begin",
      actorId: actorId(token),
      after: { jobId: targetId, state: job.state },
      projectId: token.projectId,
      targetId,
      targetType: "cloud_import_job",
    },
    client,
  );
}

export function writeCloudImportSessionCreateAudit(
  token: VerifiedMigrationToken,
  job: CloudImportJob,
  client?: AuditClient,
) {
  const targetId = jobId(job);
  return writeAudit(
    {
      action: "cloud_import.session_create",
      actorId: actorId(token),
      after: { chunkCount: job.chunkCount, jobId: targetId, state: job.state },
      projectId: token.projectId,
      targetId,
      targetType: "cloud_import_job",
    },
    client,
  );
}

export function writeCloudImportDoneAudit(
  token: VerifiedMigrationToken,
  job: CloudImportJob,
  counts: Record<string, number>,
  client?: AuditClient,
) {
  const targetId = jobId(job);
  return writeAudit(
    {
      action: "cloud_import.done",
      actorId: actorId(token),
      after: { counts, jobId: targetId, state: job.state },
      projectId: token.projectId,
      targetId,
      targetType: "cloud_import_job",
    },
    client,
  );
}

export function writeCloudImportFailAudit(
  token: VerifiedMigrationToken,
  job: CloudImportJob,
  error: string,
  client?: AuditClient,
) {
  const targetId = jobId(job);
  return writeAudit(
    {
      action: "cloud_import.fail",
      actorId: actorId(token),
      after: { error, jobId: targetId, state: job.state },
      projectId: token.projectId,
      status: "failed",
      statusReason: error,
      targetId,
      targetType: "cloud_import_job",
    },
    client,
  );
}

export function writeMigrationTokenConsumeAudit(
  token: VerifiedMigrationToken,
  consumedAt: Date,
  client?: AuditClient,
) {
  return writeAudit(
    {
      action: "migration_token.consume",
      actorId: actorId(token),
      after: { consumedAt, id: token.publicId, singleUse: token.singleUse ?? null },
      projectId: token.projectId,
      targetId: token.publicId,
      targetType: "migration_token",
    },
    client,
  );
}
