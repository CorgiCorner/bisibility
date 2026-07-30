import "server-only";

import { decodeCursor, encodeCursor } from "@/lib/api/pagination";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { publicAuditTargetIdOrNull } from "@/lib/queries/audit-public-values";
import { notFound } from "next/navigation";

const INSTANCE_ADMIN_AUDIT_PAGE_SIZE = 25;
const MAX_CURSOR_LENGTH = 2_048;

export type InstanceAdminAuditFilter = "account" | "all" | "ops" | "setup";
export type InstanceAdminAuditResult = "blocked" | "failed" | "ok";

export type InstanceAdminAuditEntry = {
  action: string;
  actorEmail: string | null;
  createdAt: string;
  id: string;
  result: InstanceAdminAuditResult;
  targetId: string | null;
  targetType: string;
};

export type InstanceAdminAuditPage = {
  entries: readonly InstanceAdminAuditEntry[];
  filter: InstanceAdminAuditFilter;
  nextCursor: string | null;
};

const ACTION_PREFIX_BY_FILTER = {
  account: "instance_admin.account_",
  all: "instance_admin.",
  ops: "instance_admin.ops_",
  setup: "instance_admin.first_run_",
} as const satisfies Record<InstanceAdminAuditFilter, string>;

const GUARD_REASON_PATTERN =
  /\b(blocked|cannot|can't|forbidden|guard(?:ed)?|last instance admin(?:istrator)?|may not|must not|not allowed|protected|transfer instance administration first)\b/i;

function normalizeFilter(filter: string | null | undefined): InstanceAdminAuditFilter {
  if (filter === "account" || filter === "ops" || filter === "setup") {
    return filter;
  }
  return "all";
}

function auditResult(status: string, statusReason: string | null): InstanceAdminAuditResult {
  if (statusReason && GUARD_REASON_PATTERN.test(statusReason)) {
    return "blocked";
  }
  return status === "failed" ? "failed" : "ok";
}

function auditPublicId(value: string | null) {
  if (!value || !isPublicIdOfType(value, "audit")) {
    throw new Error("Instance audit row is missing a v3 public ID.");
  }
  return value;
}

function decodeAuditCursor(cursor: string | null | undefined) {
  if (!cursor) return null;
  if (cursor.length > MAX_CURSOR_LENGTH)
    throw new Error("Audit cursor exceeds the maximum length.");

  const decoded = decodeCursor(cursor, "audit");
  return decoded ? { createdAt: new Date(decoded.t), publicId: decoded.public_id } : null;
}

export async function getInstanceAdminAuditPage({
  cursor,
  filter: rawFilter,
}: {
  cursor?: string | null;
  filter?: string | null;
} = {}): Promise<InstanceAdminAuditPage> {
  const session = await getInstanceAdminSession();
  if (!session) {
    notFound();
  }

  const filter = normalizeFilter(rawFilter);
  const actionPrefix = ACTION_PREFIX_BY_FILTER[filter];
  const decodedCursor = decodeAuditCursor(cursor);
  const actionWhere = { action: { startsWith: actionPrefix } };
  const where = decodedCursor
    ? {
        AND: [
          actionWhere,
          {
            OR: [
              { createdAt: { lt: decodedCursor.createdAt } },
              { createdAt: decodedCursor.createdAt, publicId: { lt: decodedCursor.publicId } },
            ],
          },
        ],
      }
    : actionWhere;

  const rows = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    select: {
      action: true,
      actor: { select: { email: true } },
      createdAt: true,
      publicId: true,
      status: true,
      statusReason: true,
      targetId: true,
      targetType: true,
    },
    take: INSTANCE_ADMIN_AUDIT_PAGE_SIZE + 1,
    where,
  });
  const pageRows = rows.slice(0, INSTANCE_ADMIN_AUDIT_PAGE_SIZE);
  const lastRow = pageRows.at(-1);

  return {
    entries: pageRows.map((row) => ({
      action: row.action,
      actorEmail: row.actor?.email ?? null,
      createdAt: row.createdAt.toISOString(),
      id: auditPublicId(row.publicId),
      result: auditResult(row.status, row.statusReason),
      targetId: publicAuditTargetIdOrNull(row.targetId, row.targetType),
      targetType: row.targetType,
    })),
    filter,
    nextCursor:
      rows.length > INSTANCE_ADMIN_AUDIT_PAGE_SIZE && lastRow
        ? encodeCursor(
            { publicId: auditPublicId(lastRow.publicId), timestamp: lastRow.createdAt },
            "audit",
          )
        : null,
  };
}
