import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AlertDigestJob } from "./digest-types";

/** Old activities have no submission receipt, so a new worker cannot safely replay their send. */
export async function legacyDigestAdmission(job: AlertDigestJob) {
  const ids = [...new Set(job.alertIds)];
  if (job.deliveryClaimToken && ids.length) {
    const rows = await prisma.triggeredAlert.findMany({
      select: { id: true, digestSubmissionStarted: true },
      where: {
        id: { in: ids },
        deliveryState: "digesting",
        deliveryClaimToken: job.deliveryClaimToken,
      },
    });
    if (rows.length === ids.length && rows.every((row) => row.digestSubmissionStarted !== null))
      return null;
  }
  return {
    delivered: false,
    unknown: true,
    reason: "Legacy digest submission outcome is unknown.",
  };
}
