import {
  canTransition,
  jobView,
  type VerifiedMigrationToken,
} from "@/lib/api/instance-import/jobs";
import { requireApiPublicId } from "@/lib/api/public-id";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { CloudImportJob, CloudImportState, Prisma } from "@/lib/generated/prisma/client";

export async function recordCreatedCloudImportJob(
  token: VerifiedMigrationToken,
  job: CloudImportJob,
) {
  const view = jobView(job);
  await writeAudit({
    action: "cloud_import.create",
    actorId: null,
    after: { jobId: view.id, state: job.state },
    projectId: token.projectId,
    targetId: requiredPublicAuditId(view.id, "imp", "Instance import job"),
    targetType: "cloud_import_job",
  });
  return view;
}

export async function advanceCloudImportJobForProject(input: {
  actorId: string;
  counts?: Record<string, number>;
  error?: string;
  jobId: string;
  progress?: number;
  projectId: string;
  state: CloudImportState;
}) {
  const publicJobId = requireApiPublicId(input.jobId, "imp");
  const before = await prisma.cloudImportJob.findFirst({
    where: { projectId: input.projectId, publicId: publicJobId },
  });
  if (!before) {
    throw new Error("Instance import job not found.");
  }
  if (!canTransition(before.state, input.state)) {
    throw new Error(`Cannot advance instance import from ${before.state} to ${input.state}.`);
  }
  const job = await prisma.cloudImportJob.update({
    data: {
      counts: input.counts as Prisma.InputJsonValue | undefined,
      error: input.state === "failed" ? (input.error ?? "Instance import failed.") : null,
      finishedAt: input.state === "done" || input.state === "failed" ? new Date() : null,
      progress: input.state === "done" ? 100 : (input.progress ?? before.progress),
      state: input.state,
    },
    where: { id: before.id },
  });
  const afterView = jobView(job);
  const beforeView = jobView(before);
  await writeAudit({
    action: "cloud_import.advance",
    actorId: input.actorId,
    after: { id: afterView.id, progress: afterView.progress, state: afterView.state },
    before: { id: beforeView.id, progress: beforeView.progress, state: beforeView.state },
    projectId: input.projectId,
    targetId: requiredPublicAuditId(afterView.id, "imp", "Instance import job"),
    targetType: "cloud_import_job",
  });
  return { job, view: afterView };
}
