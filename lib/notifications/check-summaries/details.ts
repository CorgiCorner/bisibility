import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { readCheckEvidence } from "@/lib/provider-evidence/projection/read";
import { summaryDetailsModel } from "./details-model";

/** userId and projectId are resolved from the authenticated project boundary. */
export async function readCheckSummaryDetails(
  projectId: string,
  projectRef: string,
  userId: string,
  notificationPublicId: string,
  db: Pick<PrismaClient, "$transaction"> = prisma,
) {
  return db.$transaction(
    async (tx) => {
      const notification = await tx.notification.findFirst({
        where: {
          publicId: notificationPublicId,
          projectId,
          userId,
          type: { in: ["manual_run_summary", "scheduled_window_summary"] },
        },
        include: { checkSummary: true },
      });
      const summary = notification?.checkSummary;
      if (!notification || !summary) return null;
      const checks = await tx.rankCheck.findMany({
        where: { id: { in: summary.checkIds }, keyword: { projectId } },
        select: {
          id: true,
          publicId: true,
          keyword: {
            select: {
              text: true,
              device: true,
              locationRef: { select: { displayName: true, languageLabel: true } },
            },
          },
        },
      });
      const projections = await readCheckEvidence(
        projectId,
        { checkIds: checks.map((check) => check.id) },
        tx,
      );
      return summaryDetailsModel({
        payload: notification.payload,
        version: summary.version,
        notificationVersion: notification.version,
        withdrawn: summary.withdrawn || notification.withdrawnAt !== null,
        checkIds: summary.checkIds,
        topN: summary.topN,
        positionMove: summary.positionMove,
        projectRef,
        checks: new Map(
          checks.map((check) => [
            check.id,
            {
              keyword: check.keyword.text,
              market: [
                check.keyword.locationRef.displayName,
                check.keyword.locationRef.languageLabel,
                check.keyword.device,
              ]
                .filter(Boolean)
                .join(" / "),
            },
          ]),
        ),
        evidence: new Map(
          checks.map((check) => [check.id, projections.get(check.publicId ?? check.id) ?? null]),
        ),
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
