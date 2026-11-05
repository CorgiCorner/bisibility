import { Context } from "@temporalio/activity";
import { prisma } from "../db/prisma";
import { readOnlyDemoConfig } from "../demo/config";
import { recoverySwitches } from "../provider-evidence/recovery/switches";
import { sendWeeklyDigestForProject } from "../reports/weekly-digest-send";

export type SendWeeklyReportDigestActivityResult = {
  projects: number;
  sent: number;
  skipped: number;
  ambiguous: number;
};

export async function sendWeeklyReportDigestForAllProjects(
  now: Date,
): Promise<SendWeeklyReportDigestActivityResult> {
  // Editable demo sends digests normally; recipient selection excludes the shared Viewer.
  if (readOnlyDemoConfig()) return { projects: 0, sent: 0, skipped: 0, ambiguous: 0 };
  const incidentDigest = recoverySwitches().incidentDigest;
  const projects = await prisma.project.findMany({ select: { id: true } });
  let sent = 0,
    skipped = 0,
    failed = 0,
    ambiguous = 0;
  for (const project of projects) {
    try {
      const result = await sendWeeklyDigestForProject(project.id, now, incidentDigest);
      if (result.status === "sent") {
        sent += 1;
        failed += result.failed;
        ambiguous += result.ambiguous;
      } else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error("[reports] weekly digest failed", { error, projectId: project.id });
    }
  }
  if (failed) throw new Error(`Weekly digest has ${failed} retryable failures.`);
  return { projects: projects.length, sent, skipped, ambiguous };
}

export async function sendWeeklyReportDigestActivity(input?: {
  periodEnd: string;
}): Promise<SendWeeklyReportDigestActivityResult> {
  // Recorded legacy inputs stay empty on retry; the original scheduled time stays stable.
  const now = new Date(input?.periodEnd ?? Context.current().info.scheduledTimestampMs);
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid digest time.");
  return sendWeeklyReportDigestForAllProjects(now);
}
