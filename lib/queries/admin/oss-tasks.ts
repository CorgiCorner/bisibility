import "server-only";
import type { RecoveryCase, RecoveryFilters } from "@/lib/metering/recovery/contract";
import { getRecoveryPage } from "@/lib/metering/recovery/service";
import { ossAdminSession } from "./oss-access";

/** Keep recovery identity and task state; never ship the original monetary authorization. */
function taskCase(row: RecoveryCase): RecoveryCase {
  const { originalAuthorization: _authorization, ...task } = row;
  return {
    ...task,
    evidence: task.evidence
      ? {
          ...task.evidence,
          projection: task.evidence.projection ? { ...task.evidence.projection, cost: null } : null,
        }
      : undefined,
  };
}

export async function getOssTasks(filters: RecoveryFilters = {}, now = new Date()) {
  const session = await ossAdminSession();
  if (!session) return null;
  const page = await getRecoveryPage(
    { ...filters, provider: filters.provider === "all" ? undefined : filters.provider },
    now,
  );
  return {
    page: { ...page, rows: page.rows.map(taskCase) },
    twoFactorEnabled: session.user.twoFactorEnabled === true,
  };
}
