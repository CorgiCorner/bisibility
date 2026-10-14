import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";
import { assertRecoveryAdmin } from "./authorization";
import { classifyRecoveryRecord, recoveryBasis } from "./classify";
import { RecoveryCaseChangedError } from "./errors";
import { triageInputSchema } from "./input";
import { readRecoveryRecords } from "./query";
import { recoveryScope } from "./read";
import { openRecoveryCase } from "./tokens";

export async function updateRecoveryTriage(input: unknown) {
  const session = await requireInstanceAdmin(),
    value = triageInputSchema.parse(input),
    now = new Date();
  const scope = recoveryScope(session.user.id),
    identity = openRecoveryCase(value.caseToken, scope);
  if (
    value.snoozedUntil &&
    (Date.parse(value.snoozedUntil) <= now.getTime() ||
      Date.parse(value.snoozedUntil) > now.getTime() + 31 * 86400000)
  )
    throw new Error("Select a future due date within 31 days");
  return prisma.$transaction(
    async (tx) => {
      await assertRecoveryAdmin(tx, scope.actor);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recovery-triage:${scope.namespace}:${identity.kind}:${identity.id}`}))`;
      const [record] = await readRecoveryRecords(tx, scope.namespace, {
        to: now,
        identity,
        limit: 1,
      });
      if (!record) throw new RecoveryCaseChangedError("Recovery case is no longer open");
      const current = classifyRecoveryRecord(record, scope, now);
      if (current.version !== value.expectedVersion)
        throw new RecoveryCaseChangedError("The recovery case changed. Refresh and try again.");
      const data = {
        basisHash: recoveryBasis(record),
        status: value.status,
        reason: value.reason,
        assigneeId: value.assignToMe ? scope.actor : null,
        snoozedUntil: value.snoozedUntil ? new Date(value.snoozedUntil) : null,
        updatedById: scope.actor,
        version: { increment: 1 },
      };
      await tx.meteringRecoveryTriage.upsert({
        where: { namespace_caseKey: { namespace: scope.namespace, caseKey: record.key } },
        create: { ...data, namespace: scope.namespace, caseKey: record.key, version: 1 },
        update: data,
      });
      await writeAudit(
        {
          action: "instance_admin.metering_recovery_triaged",
          actorId: scope.actor,
          targetType: "instance_ops",
          targetId: "metering-recovery",
          before: { status: current.triage.status },
          after: {
            status: value.status,
            assigned: value.assignToMe,
            reason: value.reason ?? "none",
          },
        },
        tx,
      );
      return { status: value.status };
    },
    { timeout: 30000 },
  );
}
