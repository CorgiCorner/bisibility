import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const DEFAULT_RETENTION_DAYS = 365;
const retentionDaysSchema = z.coerce.number().int().min(1).max(3650);

export type PurgeAuditLogsInput = {
  now?: Date;
  retentionDays?: number;
};

export type PurgeAuditLogsSummary = {
  cutoff: Date;
  deleted: number;
  retentionDays: number;
};

export function getAuditRetentionDays() {
  const value = process.env.AUDIT_RETENTION_DAYS;
  return value ? retentionDaysSchema.parse(value) : DEFAULT_RETENTION_DAYS;
}

export async function purgeAuditLogs({
  now = new Date(),
  retentionDays,
}: PurgeAuditLogsInput = {}): Promise<PurgeAuditLogsSummary> {
  const days =
    retentionDays === undefined
      ? getAuditRetentionDays()
      : retentionDaysSchema.parse(retentionDays);
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  await writeAudit({
    action: "audit_log.purge",
    actorId: null,
    after: { cutoff: cutoff.toISOString(), deletedCount: result.count, retentionDays: days },
    projectId: null,
    targetId: "audit_log",
    targetType: "system",
  });

  return {
    cutoff,
    deleted: result.count,
    retentionDays: days,
  };
}
