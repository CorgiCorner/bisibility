import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import type { AuditRequestContext } from "@/lib/auth/request-context";
import { prisma } from "@/lib/db/prisma";

const MAX_TRANSACTION_ATTEMPTS = 3;

export type FirstRunPromotionResult =
  | "administrator_exists"
  | "already_administrator"
  | "promoted"
  | "retry";

function isTransactionConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

export async function promoteFirstRunAdministrator(
  userId: string,
  email: string,
  requestContext: AuditRequestContext,
) {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const promoted = await transaction.$queryRaw<Array<{ publicId: string | null }>>`
            UPDATE "users" AS candidate
            SET "isInstanceAdmin" = true, "updatedAt" = NOW()
            WHERE candidate."id" = ${userId}
              AND candidate."isInstanceAdmin" = false
              AND NOT EXISTS (
                SELECT 1
                FROM "users" AS existing
                WHERE existing."isInstanceAdmin" = true
              )
            RETURNING candidate."publicId"
          `;

          if (promoted.length === 0) {
            const candidate = await transaction.user.findUnique({
              select: { isInstanceAdmin: true },
              where: { id: userId },
            });
            if (candidate?.isInstanceAdmin) {
              return "already_administrator";
            }

            const administrator = await transaction.user.findFirst({
              select: { id: true },
              where: { isInstanceAdmin: true },
            });
            return administrator ? "administrator_exists" : "retry";
          }

          await writeAudit(
            {
              action: "instance_admin.first_run_completed",
              actorId: userId,
              after: { email, isInstanceAdmin: true },
              before: { isInstanceAdmin: false },
              requestContext,
              targetId: requiredPublicAuditId(promoted[0]?.publicId ?? null, "usr", "User"),
              targetType: "user",
            },
            transaction,
          );

          return "promoted";
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }

  return "retry";
}
