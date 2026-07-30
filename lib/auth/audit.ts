import "server-only";

import { auditTargetPolicy } from "@/lib/audit/target-policy";
import { prisma } from "@/lib/db/prisma";
import { makePublicId, type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  type AuditRequestContext,
  fallbackAuditRequestContext,
  getAuditRequestContext,
} from "./request-context";

const redacted = "[redacted]";
const sensitiveKeyPattern =
  /(authorization|credential|password|secret|token|apiKey|api_key|hashedKey|hashed_key|otp|code)/i;
const sensitiveStatusPattern =
  /(authorization|bearer|credential|password|secret|token|api[_ -]?key)/i;
const MAX_STATUS_REASON_LENGTH = 300;

export type AuditStatus = "failed" | "success";

export type WriteAuditInput = {
  action: string;
  actorId: string | null;
  after?: unknown;
  before?: unknown;
  projectId?: string | null;
  requestContext?: AuditRequestContext;
  status?: AuditStatus;
  statusReason?: string;
  targetId: string;
  targetType: string;
};

export type WriteAuditFailureInput = Omit<WriteAuditInput, "status"> & {
  status?: "failed";
  statusReason: string;
};
export type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

function jsonKeywordId(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keywordId = (value as Record<string, unknown>).keywordId;
  return typeof keywordId === "string" ? keywordId : null;
}

export function requiredPublicAuditId(
  value: string | null,
  prefix: PublicIdPrefix,
  resource: string,
) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} audit targets require a public ${prefix}_ ID.`);
  }
  return value;
}

/** Enforce linkable public entity identities before an audit row reaches storage. */
export function validateAuditTarget(
  input: Pick<WriteAuditInput, "after" | "targetId" | "targetType">,
) {
  const policy = auditTargetPolicy(input.targetType);
  if (!policy) {
    throw new Error(`Audit target type "${input.targetType}" has no declared identity policy.`);
  }
  if (policy.mode === "public") {
    requiredPublicAuditId(input.targetId, policy.prefix, policy.resource);
  }
  if (input.targetType === "rank_check") {
    requiredPublicAuditId(jsonKeywordId(input.after), "kw", "Rank-check");
  }
}

function sanitizeAuditValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKeyPattern.test(key) ? redacted : sanitizeAuditValue(item),
      ]),
    );
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return typeof value === "bigint" ? value.toString() : null;
}

function sanitizeStatusReason(reason: string | undefined) {
  const cleaned = reason?.replace(/[\r\n]/g, " ").trim();
  if (!cleaned) {
    return undefined;
  }
  if (sensitiveStatusPattern.test(cleaned)) {
    return redacted;
  }
  return cleaned.slice(0, MAX_STATUS_REASON_LENGTH);
}

async function resolveRequestContext(requestContext: AuditRequestContext | undefined) {
  if (requestContext) {
    return requestContext;
  }

  try {
    return await getAuditRequestContext();
  } catch {
    return fallbackAuditRequestContext();
  }
}

export async function writeAudit(
  {
    action,
    actorId,
    after,
    before,
    projectId,
    requestContext,
    status = "success",
    statusReason,
    targetId,
    targetType,
  }: WriteAuditInput,
  client: AuditClient = prisma,
) {
  validateAuditTarget({ after, targetId, targetType });
  const sanitizedBefore =
    before === undefined ? undefined : (sanitizeAuditValue(before) ?? Prisma.JsonNull);
  const sanitizedAfter =
    after === undefined ? undefined : (sanitizeAuditValue(after) ?? Prisma.JsonNull);
  const context = await resolveRequestContext(requestContext);

  return client.auditLog.create({
    data: {
      action,
      actorId,
      after: sanitizedAfter,
      appVersion: context.appVersion,
      before: sanitizedBefore,
      correlationId: context.correlationId,
      projectId,
      publicId: makePublicId("audit"),
      sourceIpHash: context.sourceIpHash,
      sourceIpMasked: context.sourceIpMasked,
      status,
      statusReason: sanitizeStatusReason(statusReason),
      targetId,
      targetType,
      userAgent: context.userAgent,
    },
  });
}

export async function writeAuditFailure(input: WriteAuditFailureInput) {
  return writeAudit({ ...input, status: "failed" });
}
