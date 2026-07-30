import "server-only";

import { prisma } from "@/lib/db/prisma";
import { requirePublicId } from "@/lib/db/public-id";
import { assertProjectAcceptsMigration } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { hashApiKey } from "@/lib/providers/crypto";
import { CloudImportTokenError, type VerifiedMigrationToken } from "./jobs";

type TokenClient = Pick<Prisma.TransactionClient, "migrationToken">;

export async function verifyMigrationTokenInternal(
  rawToken: string,
  client: TokenClient = prisma,
): Promise<VerifiedMigrationToken> {
  const now = new Date();
  const token = await client.migrationToken.findUnique({
    select: {
      consumedAt: true,
      createdById: true,
      expiresAt: true,
      id: true,
      project: { select: { id: true, publicId: true, writeMode: true } },
      projectId: true,
      publicId: true,
      singleUse: true,
    },
    where: { hash: hashApiKey(rawToken) },
  });
  if (!token || token.consumedAt || token.expiresAt <= now) {
    throw new CloudImportTokenError("Migration token is invalid or expired.");
  }
  assertProjectAcceptsMigration(token.project);
  return {
    createdById: token.createdById,
    id: token.id,
    projectId: token.projectId,
    projectPublicId: requirePublicId(token.project.publicId, "prj"),
    publicId: requirePublicId(token.publicId, "ferry"),
    singleUse: token.singleUse,
  };
}
