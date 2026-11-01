import "server-only";
import { checkDueProviderAccounts } from "../integrations/provider-recovery/auto-checks";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";

export async function checkProviderAccountsActivity() {
  if (!isScheduledMaintenanceEnabled()) return { status: "skipped" as const };
  const result = await checkDueProviderAccounts();
  console.info("[provider-account-checks]", result);
  return result;
}
