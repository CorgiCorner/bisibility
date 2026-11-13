import { type AuditPayloadPolicy, auditFields as f } from "@/lib/auth/audit-payload-policy";
import { reviewedConsentPolicy } from "./audit-field-declarations-consent";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;

export function registerRankCheckRunAuditDeclarations(declare: Declare) {
  const auditRun = { ...f.strings("state"), ...f.numbers("generation") };
  declare(["page_vitals.check"], {
    after: { ...f.numbers("checked"), ...f.strings("code", "scope") },
  });
  declare(["challenge_report.create", "challenge_report.refresh"], {
    after: { ...f.numbers("days"), ...f.strings("reportId", "stage") },
  });
  declare(["challenge_report.lessons"], {
    after: f.strings("reportId"),
  });
  declare(["report_share.publish", "report_share.reissue", "report_share.revoke"], {
    after: f.strings("reportId"),
  });
  declare(["report_share.expiry"], {
    after: f.strings("expires", "reportId"),
  });
  declare(["report_share.settings"], {
    after: {
      ...f.booleans("noindex", "roundNumbers", "showBadge", "showLessons"),
      ...f.strings("reportId", "visibleTiles"),
    },
  });
  declare(["report_share.update"], {
    after: f.strings("mode", "reportId"),
  });
  declare(["site_audit.cancel", "site_audit.resume"], {
    before: auditRun,
    after: { ...auditRun, ...f.strings("credentialId", "credentialKind") },
  });
  declare(["rank_check.snapshot_extend"], {
    after: {
      ...f.strings("keywordId", "status"),
      ...f.numbers("start", "addedResults", "skippedDuplicates"),
      ...f.dates("fetchedAt"),
    },
  });
  declare(["rank_check_run.launch"], {
    after: {
      ...f.numbers("estimatedCostCents", "keywordCount", "targetCount"),
      ...f.strings("publicId", "selectionKind", "trigger"),
      consent: reviewedConsentPolicy,
    },
  });
  declare(["rank_check_run.delete"], { before: f.strings("status") });
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
