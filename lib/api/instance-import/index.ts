import "server-only";

import { prisma } from "@/lib/db/prisma";
import { assertProjectAcceptsMigration } from "@/lib/deployment/project-write-mode";
import { notifyCloudImportDone, notifyCloudImportFailed } from "@/lib/notifications/events";
import {
  writeCloudImportBeginAudit,
  writeCloudImportDoneAudit,
  writeCloudImportFailAudit,
} from "./audit";
import { reportCloudImportFailure } from "./failure";
import { releaseTerminalImportHold } from "./hold";
import { createKeywordRows, importHistory, loadKeywordMaps } from "./importers";
import type { Project, VerifiedMigrationToken } from "./jobs";
import {
  advanceJob,
  assertNotSelfImport,
  beginJob,
  CloudImportTokenError,
  consumeMigrationToken,
  loadProject,
} from "./jobs";
import type { CloudImportBody } from "./schemas";
import { importCloudImportSections } from "./section-orchestrator";

const TERMINAL_FAILURE_WRITE_ATTEMPTS = 3;

function terminalFailureRetryDelay(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, attempt * 25));
}

async function writeTerminalImportFailure(
  token: VerifiedMigrationToken,
  project: Project,
  job: Awaited<ReturnType<typeof beginJob>>,
  message: string,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= TERMINAL_FAILURE_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const failedJob = await advanceJob(job.id, "failed", job.progress, undefined, message, tx);
        await writeCloudImportFailAudit(token, failedJob, message, tx);
        await releaseTerminalImportHold(project, "failed", tx);
        return failedJob;
      });
    } catch (error) {
      lastError = error;
      if (attempt < TERMINAL_FAILURE_WRITE_ATTEMPTS) {
        await terminalFailureRetryDelay(attempt);
      }
    }
  }

  console.error("[migration] terminal import failure write failed", {
    attempts: TERMINAL_FAILURE_WRITE_ATTEMPTS,
    error: lastError,
    holdState: project.writeMode,
    jobId: job.id,
    projectId: project.id,
  });
  return null;
}

export * from "./jobs";
export * from "./normalize";
export * from "./schemas";
export * from "./session";
export * from "./session-finalize";
export * from "./session-schemas";

export async function importCloudExport(
  token: VerifiedMigrationToken,
  body: CloudImportBody,
  url: URL,
) {
  const project = await loadProject(token.projectId);
  if (!project) throw new CloudImportTokenError("Migration token project was not found.");
  assertProjectAcceptsMigration(project);
  assertNotSelfImport(project, body.projectId);
  const job = await beginJob(token);
  await writeCloudImportBeginAudit(token, job);

  try {
    const { counts, finished } = await prisma.$transaction(
      async (tx) => {
        await advanceJob(job.id, "importing", 50, undefined, undefined, tx);
        const keywordCounts = await createKeywordRows(project, url, body.keywords, tx);
        const keywordMaps = await loadKeywordMaps(project.id, body.keywords, tx);
        const historyCounts = await importHistory(body.keywords, keywordMaps.byKey, tx);
        const sectionCounts = await importCloudImportSections(
          token,
          project,
          body,
          keywordMaps,
          tx,
        );
        const counts = {
          history: historyCounts.imported,
          history_received: historyCounts.received,
          history_skipped: historyCounts.skipped,
          keywords: body.keywords.length,
          keywords_created: keywordCounts.created,
          keywords_skipped: keywordCounts.skipped,
          ...sectionCounts,
        };

        await consumeMigrationToken(token, tx);
        const finished = await advanceJob(job.id, "done", 100, counts, undefined, tx);
        await writeCloudImportDoneAudit(token, finished, counts, tx);
        await releaseTerminalImportHold(project, "done", tx);
        return { counts, finished };
      },
      { timeout: 120_000 },
    );

    await notifyCloudImportDone({ counts, jobId: finished.id, projectId: project.id }).catch(
      () => undefined,
    );
    return { counts, job: finished };
  } catch (error) {
    const message = reportCloudImportFailure(error, { jobId: job.id, projectId: project.id });
    const failed = await writeTerminalImportFailure(token, project, job, message);
    if (failed) {
      await notifyCloudImportFailed({
        error: failed.error,
        jobId: failed.id,
        projectId: project.id,
      }).catch(() => undefined);
    }
    throw error;
  }
}
