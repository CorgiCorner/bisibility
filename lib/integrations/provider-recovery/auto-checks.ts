import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  accountHealthAdapter,
  accountHealthProviders,
} from "@/lib/providers/account-health/registry";
import { initializeAccountSchedules, retireAccountSchedules } from "./auto-schedule";
import { AUTO_CHECK_INCIDENT_REASONS } from "./cadence";
import { checkRecoveryAccount } from "./check-account";

export async function checkDueProviderAccounts() {
  const now = new Date();
  const providers = accountHealthProviders().filter((id) => {
    const probe = accountHealthAdapter(id)?.probe;
    return probe?.available && probe.cost === "non_billable" && probe.automaticRecheck.length > 0;
  });
  await retireAccountSchedules(providers, now);
  await initializeAccountSchedules(providers, now);
  const rows = await prisma.providerConnectionRecovery.findMany({
    where: {
      nextCheckAt: { lte: now },
      connection: {
        enabled: true,
        credentialSource: "own",
        status: { in: ["connected", "needs_reauth"] },
        provider: { in: providers },
      },
      currentIncident: {
        is: {
          resolvedAt: null,
          reason: {
            in: [...AUTO_CHECK_INCIDENT_REASONS],
          },
        },
      },
    },
    select: {
      connection: {
        select: { publicId: true, projectId: true, project: { select: { publicId: true } } },
      },
    },
    orderBy: [{ nextCheckAt: "asc" }, { connectionId: "asc" }],
    take: 5,
  });
  let checked = 0,
    skipped = 0,
    failed = 0;
  for (const row of rows) {
    try {
      const result = await checkRecoveryAccount({
        projectId: row.connection.projectId,
        projectPublicId: row.connection.project.publicId,
        connectionPublicId: row.connection.publicId,
        actorId: null,
        automatic: true,
      });
      if (["checking", "cooldown", "skipped", "stale"].includes(result.accountState)) skipped++;
      else checked++;
    } catch {
      failed++;
    }
  }
  return { status: "completed" as const, scanned: rows.length, checked, skipped, failed };
}
