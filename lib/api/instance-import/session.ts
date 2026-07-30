import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import { DEFAULT_STALE_IMPORT_JOB_MINUTES } from "@/lib/migration/stale-jobs";
import { writeCloudImportSessionCreateAudit } from "./audit";
import type { VerifiedMigrationToken } from "./jobs";
import { assertNotSelfImport, beginJob, CloudImportTokenError } from "./jobs";
import type { ImportSessionChunk, ImportSessionCreate } from "./session-schemas";

export const MAX_BUFFERED_BYTES = 268_435_456;
export const MAX_CHUNK_KEYWORDS = 500;
export const MAX_CHUNK_HISTORY_ROWS = 25_000;
export const BODY_TOO_LARGE_DETAIL = "Import payload exceeds the maximum allowed size.";
export const BUFFER_TOO_LARGE_DETAIL = "Import session exceeds the maximum buffered size.";
const SESSION_CREATE_ATTEMPTS = 3;

export class ImportSessionProtocolError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 413,
    public readonly detail: string,
  ) {
    super(detail);
  }
}

const conflict = (detail: string) => new ImportSessionProtocolError(409, detail);
const badRequest = (detail: string) => new ImportSessionProtocolError(400, detail);
const notFound = () => new ImportSessionProtocolError(404, "Import session not found.");
const payloadTooLarge = (detail: string) => new ImportSessionProtocolError(413, detail);

function staleCutoff() {
  return new Date(Date.now() - DEFAULT_STALE_IMPORT_JOB_MINUTES * 60_000);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return structuredClone(value) as Prisma.InputJsonValue;
}

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function isUniqueChunkIndexConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function progress(received: number, chunkCount: number, base: number) {
  return base + Math.floor(49 * (received / chunkCount));
}

function chunkPayload(chunk: ImportSessionChunk) {
  return chunk.kind === "keywords" ? { keywords: chunk.keywords } : { sections: chunk.sections };
}

export function deleteChunksForJobs(jobIds: string[]) {
  if (jobIds.length === 0) return Promise.resolve({ count: 0 });
  return prisma.migrationImportChunk.deleteMany({ where: { jobId: { in: jobIds } } });
}

export async function createImportSession(
  token: VerifiedMigrationToken,
  input: ImportSessionCreate,
) {
  for (let attempt = 0; attempt < SESSION_CREATE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const project = await tx.project.findUnique({
            select: { id: true, publicId: true },
            where: { id: token.projectId },
          });
          if (!project) throw new CloudImportTokenError("Migration token project was not found.");
          assertNotSelfImport(project, input.sourceProjectId);
          const live = await tx.cloudImportJob.findFirst({
            where: {
              projectId: token.projectId,
              state: { in: ["receiving", "importing"] },
              tokenId: token.id,
              updatedAt: { gte: staleCutoff() },
            },
          });
          if (live) throw conflict("An import session is already active for this token.");

          const job = await beginJob(token, tx);
          await tx.migrationImportChunk.deleteMany({ where: { jobId: job.id } });
          const session = await tx.cloudImportJob.update({
            data: {
              chunkCount: input.chunkCount,
              chunksImported: 0,
              chunksReceived: 0,
              counts: Prisma.JsonNull,
              error: null,
              finishedAt: null,
              manifest: jsonValue(input.manifest),
              progress: 1,
              state: "receiving",
            },
            where: { id: job.id },
          });
          await writeCloudImportSessionCreateAudit(token, session, tx);
          return session;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isSerializationConflict(error)) throw error;
      if (attempt === SESSION_CREATE_ATTEMPTS - 1) {
        throw conflict("An import session is already active for this token.");
      }
    }
  }

  throw new Error("Import session could not be created.");
}

async function receivedCount(client: Prisma.TransactionClient, jobId: string) {
  return client.migrationImportChunk.count({ where: { jobId } });
}

export async function receiveImportSessionChunk(
  token: VerifiedMigrationToken,
  sessionId: string,
  index: number,
  chunk: ImportSessionChunk,
  bytes: number,
) {
  if (!isPublicIdOfType(sessionId, "imp")) {
    throw badRequest("Import session ID must be a v3 job public ID.");
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const job = await tx.cloudImportJob.findFirst({
          where: { projectId: token.projectId, publicId: sessionId, tokenId: token.id },
        });
        if (!job) throw notFound();
        if (job.chunkCount === null || index < 0 || index >= job.chunkCount) {
          throw badRequest("Chunk index is out of range.");
        }
        if (job.state !== "receiving") throw conflict("Import session is not accepting chunks.");

        const existing = await tx.migrationImportChunk.findUnique({
          where: { jobId_index: { index, jobId: job.id } },
        });
        if (existing) {
          if (existing.checksum !== chunk.checksum) {
            throw conflict(`Chunk ${index} was already received with different content.`);
          }
          const count = await receivedCount(tx, job.id);
          return { chunkCount: job.chunkCount, chunksReceived: count, state: "receiving" as const };
        }

        const buffered = await tx.migrationImportChunk.aggregate({
          _sum: { bytes: true },
          where: { jobId: job.id },
        });
        if ((buffered._sum.bytes ?? 0) + bytes > MAX_BUFFERED_BYTES) {
          throw payloadTooLarge(BUFFER_TOO_LARGE_DETAIL);
        }

        await tx.migrationImportChunk.create({
          data: {
            bytes,
            checksum: chunk.checksum,
            index,
            jobId: job.id,
            kind: chunk.kind,
            payload: jsonValue(chunkPayload(chunk)),
          },
        });
        const count = await receivedCount(tx, job.id);
        await tx.cloudImportJob.update({
          data: { chunksReceived: count, progress: progress(count, job.chunkCount, 1) },
          where: { id: job.id },
        });
        return { chunkCount: job.chunkCount, chunksReceived: count, state: "receiving" as const };
      });
    } catch (error) {
      if (!isUniqueChunkIndexConflict(error) || attempt === 1) throw error;
    }
  }

  throw new Error("Import chunk could not be received.");
}
