import { type AuditPayloadPolicy, auditFields as f } from "@/lib/auth/audit-payload-policy";

export function registerInstanceAdminAuditDeclarations(
  declare: (actions: readonly string[], policy?: AuditPayloadPolicy) => void,
) {
  declare(["instance_admin.delete_blocked"], { before: f.booleans("isInstanceAdmin") });
  const announcement = { ...f.strings("announcementId", "contentHash"), ...f.booleans("enabled") };
  declare(["instance_admin.announcement_created"], { after: announcement });
  declare(["instance_admin.announcement_updated", "instance_admin.announcement_toggled"], {
    before: announcement,
    after: announcement,
  });
  declare(["instance_admin.announcement_deleted"], { before: announcement });
  declare(
    [
      "instance_admin.account_deactivate_failed",
      "instance_admin.account_deactivate_rate_limited",
      "instance_admin.account_limits_reset_failed",
      "instance_admin.account_limits_reset_rate_limited",
      "instance_admin.account_reactivate_failed",
      "instance_admin.account_reactivate_rate_limited",
    ],
    { after: f.strings("requestedTarget") },
  );
  declare(["instance_admin.account_deactivate_blocked"], {
    before: { ...f.dates("deactivatedAt"), ...f.booleans("isInstanceAdmin") },
  });
  declare(["instance_admin.account_deactivated", "instance_admin.account_reactivated"], {
    after: { ...f.dates("deactivatedAt"), ...f.numbers("revokedTokenCount") },
    before: f.dates("deactivatedAt"),
  });
  declare(["instance_admin.account_limits_reset"], {
    after: {
      ...f.booleans("budgetReset"),
      ...f.numbers("clearedBuckets"),
      ...f.strings("requestedTarget"),
    },
  });
  declare(["instance_admin.account_viewed"], { after: f.strings("result") });
  declare(
    [
      "instance_admin.ops_sweep.failed",
      "instance_admin.ops_sweep.rate_limited",
      "instance_admin.ops_sweep.run",
    ],
    { after: { ...f.numbers("attempted", "delivered"), ...f.strings("result") } },
  );
  declare(
    [
      "instance_admin.ops_test.failed",
      "instance_admin.ops_test.rate_limited",
      "instance_admin.ops_test.send",
    ],
    { after: f.strings("result") },
  );
}
