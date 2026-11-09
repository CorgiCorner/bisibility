import { continueAsNew, proxyActivities } from "@temporalio/workflow";
import type { domainVerificationActivity } from "./domain-verification-activity";

const activities = proxyActivities<{
  domainVerificationActivity: typeof domainVerificationActivity;
}>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 1 },
});
export async function domainVerificationWorkflow(
  noticeCursor?: string,
  noticeScanComplete = false,
): Promise<{ checked: number; notices: number }> {
  let checked = 0;
  let notices = 0;
  for (let batch = 0; batch < 20; batch++) {
    const result = await activities.domainVerificationActivity(noticeCursor, noticeScanComplete);
    noticeCursor = result.noticeCursor;
    noticeScanComplete = result.noticeScanComplete;
    checked += result.checked;
    notices += result.notices;
    if (!result.hasMore) return { checked, notices };
  }
  return continueAsNew<typeof domainVerificationWorkflow>(noticeCursor, noticeScanComplete);
}
