import "server-only";
import { sweepCheckNotificationSummaries } from "../notifications/check-summaries/sweep";

export async function checkNotificationSummariesActivity() {
  return sweepCheckNotificationSummaries();
}
