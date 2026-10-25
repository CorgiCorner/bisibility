import {
  acknowledgeOriginalQueuedSubmission,
  queuedSubmissionSnapshot,
} from "@/lib/provider-evidence/recovery/queued-completion";

export async function completeOwnedQueuedSubmission<T>(
  batchId: string,
  submit: (ownClaim: () => void) => Promise<T>,
) {
  let ownsClaim = false;
  const preceding = await queuedSubmissionSnapshot(batchId);
  try {
    return await submit(() => {
      ownsClaim = true;
    });
  } finally {
    if (ownsClaim)
      await acknowledgeOriginalQueuedSubmission(batchId, preceding).catch(() => {
        console.error("[provider-evidence] original queued submission acknowledgment failed");
      });
  }
}
