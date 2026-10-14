import "server-only";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";
import { classifyRecoveryRecord } from "./classify";
import type { RecoveryPreview } from "./contract";
import { recoveryPreviewInputSchema } from "./input";
import { readRecoveryRecords } from "./query";
import { recoveryScope } from "./read";
import { openRecoveryCase, recoveryCaseKey, sealRecoveryPreview } from "./tokens";

export async function previewRecovery(input: unknown): Promise<RecoveryPreview> {
  const session = await requireInstanceAdmin(),
    value = recoveryPreviewInputSchema.parse(input),
    now = new Date();
  const scope = recoveryScope(session.user.id),
    seen = new Set<string>();
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const items: Parameters<typeof sealRecoveryPreview>[1] = [],
        excluded: RecoveryPreview["excluded"] = [];
      const originalExposure: NonNullable<RecoveryPreview["originalExposure"]> = [];
      for (const token of value.caseTokens) {
        const identity = openRecoveryCase(token, scope),
          key = recoveryCaseKey(identity.kind, identity.id);
        if (seen.has(key)) continue;
        seen.add(key);
        const [row] = await readRecoveryRecords(tx, scope.namespace, {
          to: now,
          identity,
          limit: 1,
        });
        if (!row) {
          excluded.push({ caseToken: token, reason: "case_closed" });
          continue;
        }
        const current = classifyRecoveryRecord(row, scope, now);
        if (!current.action) {
          excluded.push({
            caseToken: token,
            reason: current.blockedReason ?? "authorization_required",
          });
          continue;
        }
        items.push({ token, version: current.version, action: current.action });
        if (current.action === "resume_queued_run" && current.originalAuthorization)
          originalExposure.push({
            caseToken: token,
            project: current.project,
            funding: current.funding,
            ...current.originalAuthorization,
          });
      }
      const preview = items.length
        ? sealRecoveryPreview(scope, items, now)
        : { token: "", expiresAt: now.toISOString() };
      return {
        ...preview,
        eligible: items.map((item) => ({ caseToken: item.token, action: item.action })),
        excluded,
        newPaidAttempts: 0,
        providerCalls: 0,
        originalRuns: items.filter((item) => item.action === "resume_queued_run").length,
        originalExposure,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
