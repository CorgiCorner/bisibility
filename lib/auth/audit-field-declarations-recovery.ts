import { type AuditPayloadPolicy, auditFields as f } from "./audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;
export function registerRecoveryAuditDeclarations(declare: Declare) {
  declare(["instance_admin.metering_viewed"], { after: f.strings("month", "project") });
  declare(["instance_admin.metering_recovery_viewed"], { after: f.strings("category") });
  declare(["instance_admin.metering_recovery_triaged"], {
    after: { ...f.strings("status", "reason"), ...f.booleans("assigned") },
    before: f.strings("status"),
  });
  declare(["instance_admin.metering_recovery_requested"], {
    after: { ...f.strings("commandId"), ...f.numbers("selected", "newPaidAttempts") },
  });
  declare(["instance_admin.metering_recovery_applied"], {
    after: f.strings("commandId", "action", "result"),
  });
  declare(["rank_check.recovered"], {
    after: { ...f.strings("keywordId", "provider", "status"), ...f.dates("checkedAt") },
    before: f.strings("status"),
  });
}
