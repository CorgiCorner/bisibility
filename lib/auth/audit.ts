import "server-only";

import { auditTargetPolicy } from "@/lib/audit/target-policy";
import { prisma } from "@/lib/db/prisma";
import { makePublicId, type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import { Prisma as PrismaRuntime } from "@/lib/generated/prisma/client";
import { auditPayloadPolicy } from "./audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "./audit-payload-policy";
import {
  type AuditRequestContext,
  fallbackAuditRequestContext,
  getAuditRequestContext,
} from "./request-context";

const redacted = "[redacted]";
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
export type AuditClient = Pick<PrismaRuntime.TransactionClient, "auditLog">;

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
  const policy = auditPayloadPolicy(action);
  const declaredBefore = sanitizeDeclaredAuditPayload(before, policy?.before);
  const declaredAfter = sanitizeDeclaredAuditPayload(after, policy?.after);
  const sanitizedBefore = declaredBefore === null ? PrismaRuntime.JsonNull : declaredBefore;
  const sanitizedAfter = declaredAfter === null ? PrismaRuntime.JsonNull : declaredAfter;
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
