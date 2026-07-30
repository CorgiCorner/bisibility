import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { assertProjectAcceptsMigration } from "@/lib/deployment/project-write-mode";
import type { CloudImportJob, MigrationImportChunk, Prisma } from "@/lib/generated/prisma/client";
import { writeCloudImportDoneAudit, writeCloudImportFailAudit } from "./audit";
import { reportCloudImportFailure } from "./failure";
import { releaseTerminalImportHold } from "./hold";
import {
  createKeywordRows,
  importHistory,
  loadKeywordMaps,
  loadKeywordMapsForProject,
} from "./importers";
import type { Project, VerifiedMigrationToken } from "./jobs";
import { advanceJob, CloudImportTokenError, consumeMigrationToken, loadProject } from "./jobs";
import { importCloudImportSections } from "./section-orchestrator";
import { ImportSessionProtocolError } from "./session";
import { importSessionChunkSchema } from "./session-schemas";

const conflict = (detail: string) => new ImportSessionProtocolError(409, detail);
const badRequest = (detail: string) => new ImportSessionProtocolError(400, detail);
const notFound = () => new ImportSessionProtocolError(404, "Import session not found.");

function progress(imported: number, chunkCount: number) {
  return 50 + Math.floor(49 * (imported / chunkCount));
}

function recordCounts(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function addCounts(base: Record<string, number>, next: Record<string, number>) {
  const counts = { ...base };
  for (const [key, value] of Object.entries(next)) counts[key] = (counts[key] ?? 0) + value;
  return counts;
}

async function ownedJob(token: VerifiedMigrationToken, sessionId: string) {
  if (!isPublicIdOfType(sessionId, "imp")) {
    throw badRequest("Import session ID must be a v3 job public ID.");
  }
  const job = await prisma.cloudImportJob.findFirst({
    where: { projectId: token.projectId, publicId: sessionId, tokenId: token.id },
  });
  if (!job) throw notFound();
  return job;
}

async function loadMigrationProject(token: VerifiedMigrationToken) {
  const project = await loadProject(token.projectId);
  if (!project) throw new CloudImportTokenError("Migration token project was not found.");
  assertProjectAcceptsMigration(project);
  return project;
}

function doneResult(job: CloudImportJob) {
  return { counts: recordCounts(job.counts), job };
}

function storedChunk(row: MigrationImportChunk) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return importSessionChunkSchema.parse({
    checksum: row.checksum,
    kind: row.kind,
    ...(payload as Record<string, unknown>),
  });
}

async function importChunk(
  token: VerifiedMigrationToken,
  project: Project,
  row: MigrationImportChunk,
  url: URL,
  tx: Prisma.TransactionClient,
) {
  const chunk = storedChunk(row);
  if (chunk.kind === "sections") {
    const maps = await loadKeywordMapsForProject(tx, project.id, chunk.sections.sourceKeywordIds);
    return importCloudImportSections(token, project, chunk.sections, maps, tx);
  }
  const keywordCounts = await createKeywordRows(project, url, chunk.keywords, tx);
  const keywordMaps = await loadKeywordMaps(project.id, chunk.keywords, tx);
  const historyCounts = await importHistory(chunk.keywords, keywordMaps.byKey, tx);
  return {
    history: historyCounts.imported,
    history_received: historyCounts.received,
    history_skipped: historyCounts.skipped,
    keywords: chunk.keywords.length,
    keywords_created: keywordCounts.created,
    keywords_skipped: keywordCounts.skipped,
  };
}

async function failSession(
  token: VerifiedMigrationToken,
  project: Project,
  job: CloudImportJob,
  error: unknown,
  progressValue: number,
) {
  const message = reportCloudImportFailure(error, { jobId: job.id, projectId: project.id });
  return prisma.$transaction(async (tx) => {
    const failedJob = await advanceJob(job.id, "failed", progressValue, undefined, message, tx);
    await writeCloudImportFailAudit(token, failedJob, message, tx);
    await tx.migrationImportChunk.deleteMany({ where: { jobId: job.id } });
    await releaseTerminalImportHold(project, "failed", tx);
    return failedJob;
  });
}

async function finishSession(
  token: VerifiedMigrationToken,
  project: Project,
  jobId: string,
  counts: Record<string, number>,
  tx: Prisma.TransactionClient,
) {
  await consumeMigrationToken(token, tx);
  const finished = await advanceJob(jobId, "done", 100, counts, undefined, tx);
  await writeCloudImportDoneAudit(token, finished, counts, tx);
  await tx.migrationImportChunk.deleteMany({ where: { jobId } });
  await releaseTerminalImportHold(project, "done", tx);
  return finished;
}

export async function finalizeImportSession(
  token: VerifiedMigrationToken,
  sessionId: string,
  url: URL,
) {
  const project = await loadMigrationProject(token);
  const job = await ownedJob(token, sessionId);
  if (job.state === "done") return doneResult(job);
  if (!job.chunkCount) throw badRequest("Import session chunk count is invalid.");
  const chunkCount = job.chunkCount;

  const received = await prisma.migrationImportChunk.count({ where: { jobId: job.id } });
  if (received < chunkCount) throw conflict(`Missing ${chunkCount - received} chunk(s).`);

  const locked = await prisma.cloudImportJob.updateMany({
    data: { progress: 50, state: "importing" },
    where: { id: job.id, state: "receiving" },
  });
  if (locked.count !== 1) {
    const latest = await ownedJob(token, sessionId);
    if (latest.state === "done") return doneResult(latest);
    throw conflict("Import session is already finalizing.");
  }

  let counts = recordCounts(job.counts);
  let imported = await prisma.migrationImportChunk.count({
    where: { importedAt: { not: null }, jobId: job.id },
  });
  let currentProgress = progress(imported, chunkCount);

  try {
    // Metadata only: payloads can add up to MAX_BUFFERED_BYTES, so each one is
    // loaded inside its own chunk transaction to keep peak memory at one chunk.
    const chunks = await prisma.migrationImportChunk.findMany({
      orderBy: { index: "asc" },
      select: { id: true, importedAt: true },
      where: { jobId: job.id },
    });
    for (const meta of chunks) {
      if (meta.importedAt) continue;
      const result = await prisma.$transaction(async (tx) => {
        const row = await tx.migrationImportChunk.findUniqueOrThrow({ where: { id: meta.id } });
        const delta = await importChunk(token, project, row, url, tx);
        counts = addCounts(counts, delta);
        imported += 1;
        currentProgress = progress(imported, chunkCount);
        await tx.migrationImportChunk.update({
          data: { importedAt: new Date() },
          where: { id: row.id },
        });
        await tx.cloudImportJob.update({
          data: { chunksImported: imported, counts, progress: currentProgress },
          where: { id: job.id },
        });
        return imported === chunkCount ? finishSession(token, project, job.id, counts, tx) : null;
      });
      if (result) return { counts, job: result };
    }

    const finished = await prisma.$transaction((tx) =>
      finishSession(token, project, job.id, counts, tx),
    );
    return { counts, job: finished };
  } catch (error) {
    await failSession(token, project, job, error, currentProgress);
    throw error;
  }
}
