import {
  type AuditFieldPolicy,
  type AuditPayloadPolicy,
  auditFields as f,
} from "./audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;
export function registerLocalMeasurementAuditDeclarations(declare: Declare) {
  declare(
    [
      "local_monitor.create",
      "local_monitor.revise",
      "local_monitor.archive",
      "local_monitor.schedule",
      "local_monitor.enqueue",
    ],
    {
      after: {
        ...f.strings("operation", "state", "revisionId", "scheduleIntentId", "keyHash", "bodyHash"),
        ...f.numbers("version"),
      },
    },
  );
  declare(["measurement_definition.capture", "measurement_definition.configure"], {
    after: f.strings("operation", "revisionId", "previousRevisionId"),
  });
  declare(
    [
      "local_measurement.target_create",
      "local_measurement.launch",
      "local_measurement.cancel",
      "local_measurement.reconcile",
      "local_measurement.collect",
      "local_measurement.lease_claim",
    ],
    {
      after: {
        ...f.strings("operation", "state", "keyHash", "bodyHash", "sourceHash", "quoteHash"),
        ...f.numbers("version", "count", "changedCount"),
      },
    },
  );
  const businessHistory = {
    ...f.strings("operation", "state", "revisionId", "previousId", "keyHash", "bodyHash"),
    ...f.numbers("version", "revision", "decisionRevision", "changedCount"),
  };
  declare(
    [
      "business_location.create",
      "business_location.revise",
      "business_location.archive",
      "business_location.restore",
      "entity_match.rematch",
      "entity_match.confirm",
      "entity_match.reject",
      "business_assignment.assign",
      "business_assignment.unassign",
    ],
    { before: businessHistory, after: businessHistory },
  );
}
export function registerRankCheckAuditDeclarations(declare: Declare, rankCheck: AuditFieldPolicy) {
  const strings = (...names: string[]) => f.strings(...names);
  declare(["rank_check.queue_first"], {
    after: { ...f.numbers("queued"), ...strings("reason") },
  });
  const rankCheckRun = {
    ...(rankCheck as Record<string, AuditFieldPolicy>),
    ...strings("code", "message", "runId"),
    ...f.urls("rankingUrl"),
  };
  declare(["rank_check.requested", "rank_check.run_now"], { after: rankCheckRun });
  declare(["rank_check.completed", "rank_check.failed", "rank_check.stale_failed"], {
    after: rankCheck,
    before: rankCheck,
  });
  declare(["rank_check.deferred", "rank_check.running"], {
    after: rankCheck,
    before: rankCheck,
  });
  declare(["rank_check.raw_purge"], {
    after: {
      ...f.numbers("batchSize", "deletedCount", "retentionDays", "updatedCount"),
      ...f.dates("cutoff"),
    },
  });
}
