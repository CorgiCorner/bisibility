import { type AuditPayloadPolicy, auditFields as f } from "./audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;
export function registerRecoveryAuditDeclarations(declare: Declare) {
  declare(["provider.recovery_account_check_started"], {
    after: f.booleans("freeAccountCheck", "paidReplay"),
  });
  declare(["provider.recovery_account_checked"], {
    after: {
      ...f.strings("accountState"),
      ...f.booleans("freeAccountCheck", "paidReplay"),
    },
  });
  declare(["provider.payment_required", "provider.account_blocked"], {
    after: {
      ...f.strings("reason"),
      ...f.numbers("httpStatus"),
      ...f.booleans("paidTransportPaused", "originalCostConfirmed"),
    },
  });
  declare(["instance_admin.metering_cost_unknown_closed"], {
    after: {
      ...f.strings("policy", "planHash", "cost", "reason", "evidenceRef"),
      ...f.numbers("count"),
    },
  });
  declare(["instance_admin.metering_history_closed"], {
    after: {
      ...f.strings("policy", "planHash", "disposition", "connection", "retiredProjectId"),
      ...f.numbers("count"),
    },
  });
  declare(["instance_admin.metering_viewed"], {
    after: f.strings("month", "project"),
  });
  declare(["instance_admin.metering_recovery_viewed"], {
    after: f.strings("category"),
  });
  declare(["instance_admin.metering_recovery_triaged"], {
    after: { ...f.strings("status", "reason"), ...f.booleans("assigned") },
    before: f.strings("status"),
  });
  declare(["instance_admin.metering_recovery_requested"], {
    after: {
      ...f.strings("commandId"),
      ...f.numbers("selected", "newPaidAttempts"),
    },
  });
  declare(["instance_admin.metering_recovery_applied"], {
    after: f.strings("commandId", "action", "result"),
  });
  declare(["rank_check.recovered"], {
    after: {
      ...f.strings("keywordId", "provider", "status"),
      ...f.dates("checkedAt"),
    },
    before: f.strings("status"),
  });
}
