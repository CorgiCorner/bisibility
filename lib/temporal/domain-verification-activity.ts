import "server-only";
import { prisma } from "../db/prisma";
import { domainVerificationEnabled } from "../domain-verification/feature";
import { checkStoredVerification } from "../domain-verification/service";
import { sendEmail } from "../email/send";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";

export async function domainVerificationActivity(
  noticeCursor?: string,
  noticeScanComplete = false,
) {
  if (!isScheduledMaintenanceEnabled() || !(await domainVerificationEnabled()))
    return { checked: 0, notices: 0, hasMore: false, noticeCursor, noticeScanComplete };
  const now = new Date();
  const due = await prisma.projectDomainVerification.findMany({
    where: { nextCheckAt: { lte: now } },
    orderBy: { nextCheckAt: "asc" },
    take: 20,
  });
  for (const row of due) await checkStoredVerification(row, now);
  const revoked = noticeScanComplete
    ? []
    : await prisma.projectDomainVerification.findMany({
        where: {
          revokedAt: { not: null },
          noticeSentAt: null,
          ...(noticeCursor ? { id: { gt: noticeCursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 20,
        include: { project: { select: { owner: { select: { email: true } } } } },
      });
  let notices = 0;
  for (const row of revoked) {
    if (!row.revokedAt) continue;
    try {
      const message = `Verification for ${row.domain} has been lost. Check the domain verification settings for your project.`;
      await sendEmail({
        category: "transactional",
        to: row.project.owner.email,
        subject: "Domain verification lost",
        text: message,
        html: `<p>${message}</p>`,
        requireProvider: true,
        idempotencyKey: `domain-verification:${row.id}:${row.revokedAt.toISOString()}`,
      });
      const updated = await prisma.projectDomainVerification.updateMany({
        where: { id: row.id, revokedAt: row.revokedAt, noticeSentAt: null },
        data: { noticeSentAt: new Date() },
      });
      notices += updated.count;
    } catch {
      console.error("[domain-verification] owner notice delivery failed");
    }
  }
  return {
    checked: due.length,
    notices,
    hasMore: due.length === 20 || revoked.length === 20,
    noticeCursor: revoked.at(-1)?.id ?? noticeCursor,
    noticeScanComplete: noticeScanComplete || revoked.length < 20,
  };
}
