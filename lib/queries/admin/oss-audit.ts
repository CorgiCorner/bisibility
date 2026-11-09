import "server-only";
import {
  getInstanceAdminAuditPage,
  type InstanceAdminAuditPage,
} from "@/lib/queries/instance-admin-audit";
import { ossAdminSession } from "./oss-access";

export async function getOssAudit(options: Parameters<typeof getInstanceAdminAuditPage>[0] = {}) {
  if (!(await ossAdminSession())) return null;
  const page = await getInstanceAdminAuditPage({ ...options, operationsOnly: true });
  return auditPageView(page);
}

export function auditPageView(page: InstanceAdminAuditPage) {
  return {
    initialFilter: page.filter,
    entries: page.entries.map((entry) => ({
      id: entry.id,
      time: entry.createdAt,
      actor: entry.actorEmail ?? "-",
      action: entry.action,
      target: entry.targetId ?? "-",
      targetType: entry.targetType,
      result: entry.result,
      category: entry.action.startsWith("instance_admin.account_")
        ? ("account" as const)
        : entry.action.startsWith("instance_admin.first_run_")
          ? ("setup" as const)
          : ("ops" as const),
    })),
    nextCursor: page.nextCursor ?? undefined,
  };
}
