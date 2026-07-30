import { randomBytes } from "node:crypto";
import { jobView } from "@/lib/api/instance-import/jobs";
import { requireApiPublicId } from "@/lib/api/public-id";
import { consume } from "@/lib/api/ratelimit";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { MigrationScope } from "@/lib/generated/prisma/client";
import {
  MigrationTokenAlreadyConsumedError,
  MigrationTokenNotActiveError,
} from "@/lib/migration/token-errors";
import { hashApiKey } from "@/lib/providers/crypto";

const DEFAULT_TOKEN_TTL_MINUTES = 60;
const MIN_TOKEN_TTL_MINUTES = 5;
const MAX_TOKEN_TTL_MINUTES = 1440;
const MINT_RATE_LIMIT = 10;
const MINT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

function migrationTokenTtlMinutes() {
  const parsed = Number.parseInt(process.env.BISIBILITY_MIGRATION_TOKEN_TTL_MINUTES ?? "", 10);
  const minutes = Number.isInteger(parsed) ? parsed : DEFAULT_TOKEN_TTL_MINUTES;
  return Math.min(MAX_TOKEN_TTL_MINUTES, Math.max(MIN_TOKEN_TTL_MINUTES, minutes));
}

export async function assertMigrationTokenMintRateLimit(bucketKey: string) {
  const result = await consume({
    bucketKey,
    limit: MINT_RATE_LIMIT,
    prefix: "bisibility:migration-token-mint",
    windowSeconds: MINT_RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!result.success) {
    throw new Error("Migration token rate limit exceeded.");
  }
}

function tokenAuditResource(token: {
  consumedAt: Date | null;
  expiresAt: Date;
  publicId: string | null;
  scope: MigrationScope;
  singleUse: boolean;
}) {
  return {
    consumedAt: token.consumedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt.toISOString(),
    id: requireApiPublicId(token.publicId ?? "", "ferry"),
    scope: token.scope,
    singleUse: token.singleUse,
  };
}

export async function mintMigrationTokenForProject(input: {
  action: "migration_token.mint" | "migration_token.regenerate";
  actorId: string;
  projectId: string;
  scope: MigrationScope;
}) {
  const raw = `mig_${randomBytes(24).toString("base64url")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + migrationTokenTtlMinutes() * 60_000);
  const result = await prisma.$transaction(async (tx) => {
    await tx.migrationToken.updateMany({
      data: { consumedAt: now },
      where: { consumedAt: null, expiresAt: { gt: now }, projectId: input.projectId },
    });
    const token = await tx.migrationToken.create({
      data: {
        createdById: input.actorId,
        expiresAt,
        hash: hashApiKey(raw),
        projectId: input.projectId,
        publicId: makePublicId("ferry"),
        scope: input.scope,
        singleUse: true,
      },
    });
    const job = await tx.cloudImportJob.create({
      data: {
        progress: 0,
        projectId: input.projectId,
        publicId: makePublicId("imp"),
        state: "idle",
        tokenId: token.id,
      },
    });
    return { job, token };
  });
  const publicToken = tokenAuditResource(result.token);
  await writeAudit({
    action: input.action,
    actorId: input.actorId,
    after: publicToken,
    projectId: input.projectId,
    targetId: requiredPublicAuditId(publicToken.id, "ferry", "Migration token"),
    targetType: "migration_token",
  });
  return {
    createdAt: result.token.createdAt.toISOString(),
    expiresAt: result.token.expiresAt.toISOString(),
    id: publicToken.id,
    importJob: jobView(result.job),
    scope: result.token.scope,
    singleUse: result.token.singleUse,
    token: raw,
  };
}

export async function revokeMigrationTokenForProject(input: {
  actorId: string;
  projectId: string;
  tokenId?: string;
}) {
  const now = new Date();
  const publicId = input.tokenId ? requireApiPublicId(input.tokenId, "ferry") : undefined;
  const token = await prisma.migrationToken.findFirst({
    where: publicId
      ? { projectId: input.projectId, publicId }
      : { consumedAt: null, expiresAt: { gt: now }, projectId: input.projectId },
  });
  if (!token) {
    throw new MigrationTokenNotActiveError("Migration token is no longer active.");
  }
  if (token.consumedAt) {
    throw new MigrationTokenAlreadyConsumedError("Migration token was already consumed.");
  }
  const updated = await prisma.migrationToken.updateMany({
    data: { consumedAt: now },
    where: { consumedAt: null, id: token.id },
  });
  if (updated.count !== 1) {
    const consumed = await prisma.migrationToken.findFirst({
      where: { id: token.id, projectId: input.projectId },
    });
    if (!consumed?.consumedAt) {
      throw new MigrationTokenNotActiveError("Migration token is no longer active.");
    }
    throw new MigrationTokenAlreadyConsumedError("Migration token was already consumed.");
  }
  const before = tokenAuditResource(token);
  const after = tokenAuditResource({ ...token, consumedAt: now });
  await writeAudit({
    action: "migration_token.revoke",
    actorId: input.actorId,
    after,
    before,
    projectId: input.projectId,
    targetId: requiredPublicAuditId(after.id, "ferry", "Migration token"),
    targetType: "migration_token",
  });
  return { id: after.id, revokedAt: now.toISOString() };
}
