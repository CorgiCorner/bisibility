"use server";

import { createHash } from "node:crypto";
import { consume } from "@/lib/api/ratelimit";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { monthStartUtc } from "@/lib/rank-check/budget";
import { z } from "zod";

const LOOKUP_LIMIT = 10;
const LOOKUP_WINDOW_SECONDS = 60;
const LOOKUP_RATE_LIMIT_PREFIX = "bisibility:instance-admin:account-lookup";
const lookupInputSchema = z.object({ identifier: z.string().trim().min(1).max(320) }).strict();

export type InstanceAdminAccount = {
  createdAt: string;
  email: string;
  id: string;
  keywordCount: number;
  lastActiveAt: string | null;
  monthlySpendCents: number;
  projectCount: number;
  providerConnectionsByKind: Array<{ count: number; kind: string }>;
  status: "active" | "deactivated";
};

export type AccountLookupResult =
  | { account: InstanceAdminAccount; status: "found" }
  | { message: string; status: "not_found" }
  | { message: string; status: "forbidden" | "failed" }
  | { message: string; retryAt: string; status: "rate_limited" };

function normalizedIdentifier(raw: string) {
  const trimmed = raw.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
}

function identifierHash(identifier: string) {
  return `sha256:${createHash("sha256").update(identifier).digest("hex")}`;
}

function nextMonthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

async function auditLookup(
  actorId: string,
  targetId: string,
  result: "found" | "not_found" | "rate_limited" | "failed",
  statusReason?: string,
) {
  await writeAudit({
    action: "instance_admin.account_viewed",
    actorId,
    after: { result },
    projectId: null,
    ...(result === "found" ? {} : { status: "failed" as const, statusReason }),
    targetId,
    targetType: result === "found" ? "user" : "instance_ops",
  });
}

async function loadAccount(identifier: string, now: Date): Promise<InstanceAdminAccount | null> {
  const byEmail = identifier.includes("@");
  const user = await prisma.user.findFirst({
    select: {
      createdAt: true,
      deactivatedAt: true,
      email: true,
      id: true,
      memberships: { select: { projectId: true } },
      projects: { select: { id: true } },
      publicId: true,
      sessions: { orderBy: { updatedAt: "desc" }, select: { updatedAt: true }, take: 1 },
    },
    where: byEmail
      ? { email: { equals: identifier, mode: "insensitive" } }
      : { publicId: identifier },
  });
  if (!user) return null;

  const projectIds = [
    ...new Set([
      ...user.projects.map((project) => project.id),
      ...user.memberships.map((membership) => membership.projectId),
    ]),
  ];
  const projectWhere = { projectId: { in: projectIds } };
  const [keywordCount, connectionGroups, spend] = await Promise.all([
    prisma.keyword.count({ where: projectWhere }),
    prisma.providerConnection.groupBy({
      _count: { _all: true },
      by: ["kind"],
      where: projectWhere,
    }),
    prisma.rankCheck.aggregate({
      _sum: { costCents: true, estimatedCostCents: true },
      where: {
        checkedAt: { gte: monthStartUtc(now), lt: nextMonthStartUtc(now) },
        keyword: projectWhere,
        ...whereExecutedChecks(),
      },
    }),
  ]);

  return {
    createdAt: user.createdAt.toISOString(),
    email: user.email,
    id: requiredPublicAuditId(user.publicId, "usr", "User"),
    keywordCount,
    lastActiveAt: user.sessions[0]?.updatedAt.toISOString() ?? null,
    monthlySpendCents:
      Number(spend._sum.costCents ?? 0) + Number(spend._sum.estimatedCostCents ?? 0),
    projectCount: projectIds.length,
    providerConnectionsByKind: connectionGroups.map((group) => ({
      count: group._count._all,
      kind: group.kind,
    })),
    status: user.deactivatedAt ? "deactivated" : "active",
  };
}

export async function lookupInstanceAdminAccount(input: unknown): Promise<AccountLookupResult> {
  const session = await getInstanceAdminSession();
  if (!session) {
    return { message: "This action is not available.", status: "forbidden" };
  }

  const parsed = lookupInputSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "Enter an exact email address or user ID.", status: "failed" };
  }

  const actorId = session.user.id;
  const identifier = normalizedIdentifier(parsed.data.identifier);
  const hashedIdentifier = identifierHash(identifier);
  let limit: Awaited<ReturnType<typeof consume>>;
  try {
    limit = await consume({
      bucketKey: actorId,
      limit: LOOKUP_LIMIT,
      prefix: LOOKUP_RATE_LIMIT_PREFIX,
      windowSeconds: LOOKUP_WINDOW_SECONDS,
    });
  } catch {
    await auditLookup(actorId, hashedIdentifier, "failed", "Account lookup limiter unavailable.");
    return { message: "Account lookup is temporarily unavailable.", status: "failed" };
  }
  if (!limit.success) {
    await auditLookup(
      actorId,
      hashedIdentifier,
      "rate_limited",
      "Account lookup rate limit exceeded.",
    );
    return {
      message: "Too many account lookups. Try again shortly.",
      retryAt: new Date(limit.resetAt).toISOString(),
      status: "rate_limited",
    };
  }

  let account: InstanceAdminAccount | null;
  try {
    account = await loadAccount(identifier, new Date());
  } catch {
    await auditLookup(actorId, hashedIdentifier, "failed", "Account lookup failed.");
    return { message: "Account lookup failed.", status: "failed" };
  }
  if (!account) {
    await auditLookup(actorId, hashedIdentifier, "not_found", "Account not found.");
    return { message: "No account matched that exact identifier.", status: "not_found" };
  }

  await auditLookup(actorId, account.id, "found");
  return { account, status: "found" };
}
