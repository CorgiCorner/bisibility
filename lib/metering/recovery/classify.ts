import type { Prisma } from "@/lib/generated/prisma/client";
import { RECOVERY_ERROR_CODES, type RecoveryErrorCode } from "@/lib/provider-usage/recovery-error";
import type { RecoveryCase } from "./contract";
import type { RecoveryRecord } from "./records";
import { type RecoveryTokenScope, recoveryHash, sealRecoveryCase } from "./tokens";

function object(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function recoveryBasis(row: RecoveryRecord) {
  return recoveryHash([
    row.kind,
    row.id,
    row.version,
    row.state,
    row.fenced,
    row.binding,
    row.nativeId,
    row.receipt,
    row.proof,
    row.rankStatus,
    row.rankUpdatedAt?.toISOString(),
    row.resultExpiresAt?.toISOString(),
    row.resultBlockedCode,
    row.resumeAuthorized,
    row.originalAuthorization,
    row.projectExists,
    object(row.error).code,
  ]);
}
function failure(row: RecoveryRecord): RecoveryCase["failure"] {
  if (!row.error) return null;
  const value = object(row.error),
    code = value.code;
  return {
    code: RECOVERY_ERROR_CODES.includes(code as RecoveryErrorCode)
      ? (code as RecoveryErrorCode)
      : "recovery_failed",
    attempts: typeof value.attempts === "number" ? value.attempts : 1,
    firstFailedAt: String(value.firstFailedAt ?? value.failedAt ?? row.createdAt.toISOString()),
    failedAt: String(value.failedAt ?? row.createdAt.toISOString()),
  };
}
export function classifyRecoveryRecord(
  row: RecoveryRecord,
  scope: RecoveryTokenScope,
  now: Date,
): RecoveryCase {
  const basis = recoveryBasis(row),
    receipt = object(row.receipt),
    cost = object(receipt.cost ?? null);
  const dimensions = Array.isArray(receipt.measurements)
    ? receipt.measurements.flatMap((item) => {
        const measurement = object(item);
        return measurement.certainty !== "measured" || measurement.quantity === null
          ? [String(measurement.unit ?? "unknown")]
          : [];
      })
    : [];
  if (row.accountingUnknown && cost.certainty !== "measured") dimensions.unshift("provider_cost");
  const sameBasis = !row.triageBasis || row.triageBasis === basis;
  const expired = row.snoozedUntil !== null && row.snoozedUntil <= now;
  const resultAvailable = row.resultExpiresAt !== null && row.resultExpiresAt > now;
  let action: RecoveryCase["action"] = null,
    blockedReason: RecoveryCase["blockedReason"] = null;
  if (
    resultAvailable &&
    !row.resultBlockedCode &&
    row.projectExists &&
    row.rankStatus !== "completed"
  )
    action = "restore_result";
  else if (row.funding === "platform" && !row.proof) blockedReason = "wallet_coordination_required";
  else if (row.kind === "run") {
    if (row.resumeAuthorized && row.state === "queued") action = "resume_queued_run";
    else blockedReason = row.state === "claimed" ? "already_claimed" : "authorization_required";
  } else if (row.proof && (row.accountingUnknown || row.kind === "evidence" || row.activeError))
    action = "recover_proof";
  else if (!row.accountingUnknown && row.rankCheckId && row.rankStatus !== "completed")
    blockedReason = "authorization_required";
  else blockedReason = "proof_missing";
  if (row.resultBlockedCode && !action) blockedReason = "result_context_changed";
  if (!row.projectExists && (row.kind === "run" || row.kind === "result")) {
    action = null;
    blockedReason = "project_unavailable";
  }
  return {
    token: sealRecoveryCase(scope, row.kind, row.id),
    version: `${basis}:${row.triageVersion ?? 0}`,
    kind: row.kind,
    provider: row.provider,
    feature: row.feature,
    project: row.projectPublicId,
    connection: row.connectionPublicId,
    createdAt: row.createdAt.toISOString(),
    historical: row.historical,
    funding: row.funding === "byok" || row.funding === "platform" ? row.funding : "unknown",
    send: row.nativeId
      ? "accepted"
      : row.fenced
        ? "possibly_sent"
        : row.binding && row.state === "reserved"
          ? "not_started"
          : row.kind === "run" && row.state === "queued"
            ? "not_started"
            : "unknown",
    work:
      row.rankStatus === "completed"
        ? "completed"
        : !row.projectExists
          ? "obsolete"
          : row.rankCheckId || row.kind === "run"
            ? "unfinished"
            : "unknown",
    accounting:
      row.kind === "run" || row.kind === "result" || row.kind === "check"
        ? "not_applicable"
        : row.accountingUnknown
          ? "unknown"
          : "measured",
    unknownDimensions: [...new Set(dimensions)],
    proofAvailable: row.proof,
    spendingBlocked: row.spendingBlocked,
    originalAuthorization: row.originalAuthorization ?? null,
    failure: failure(row),
    triage: {
      status: sameBasis && !expired ? (row.triageStatus ?? "open") : "open",
      version: row.triageVersion ?? 0,
      reason: row.triageReason,
      snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
      assignedToMe: row.assigneeId === scope.actor,
    },
    action,
    blockedReason,
  };
}
