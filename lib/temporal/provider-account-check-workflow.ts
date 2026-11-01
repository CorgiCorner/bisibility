import { proxyActivities } from "@temporalio/workflow";
import type { checkProviderAccountsActivity } from "./provider-account-check-activity";

const { checkProviderAccountsActivity: check } = proxyActivities<{
  checkProviderAccountsActivity: typeof checkProviderAccountsActivity;
}>({ startToCloseTimeout: "2 minutes", retry: { maximumAttempts: 1 } });

export async function checkProviderAccountsWorkflow() {
  return check();
}
