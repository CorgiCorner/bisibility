import { type AuditPayloadPolicy, auditFields as f } from "@/lib/auth/audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;

export function registerRankCheckRunAuditDeclarations(declare: Declare) {
  declare(["rank_check_run.launch"], {
    after: {
      ...f.numbers("estimatedCostCents", "keywordCount", "targetCount"),
      ...f.strings("publicId", "selectionKind", "trigger"),
    },
  });
  declare(["rank_check_run.cancel"], {
    after: f.strings("status"),
  });
  declare(["rank_check_run.run_now"], {
    after: f.booleans("launched"),
  });
  declare(["rank_check_run.skip"], {
    after: {
      ...f.dates("plannedFor"),
      ...f.strings("publicId", "schedule", "status"),
    },
  });
  declare(["rank_check_run.retry"], {
    after: f.strings("parentRunId", "relation"),
  });
  declare(["rank_check_run.item_cancelled"], {
    after: f.strings("itemId", "keywordId", "reason"),
  });
  declare(["rank_check_run.item_reclaimed"], {
    after: {
      ...f.numbers("claimAttempts"),
      ...f.strings("itemId", "keywordId", "reason"),
    },
  });
}
