import {
  type AuditFieldPolicy,
  type AuditPayloadPolicy,
  auditFields as f,
} from "@/lib/auth/audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;
type SharedPolicies = Record<
  "market" | "projectDefaults" | "provider" | "rankCheck",
  AuditFieldPolicy
>;

export function registerAdditionalAuditDeclarations(
  declare: Declare,
  { market, projectDefaults, provider, rankCheck }: SharedPolicies,
) {
  const list = (policy: AuditFieldPolicy): readonly [AuditFieldPolicy] => [policy];
  const strings = (...names: string[]) => f.strings(...names);
  const notificationPreference = {
    ...f.booleans("alertEmail", "alertSlack", "alertWebhook", "reportEmail"),
    ...strings("digestFrequency"),
  };
  declare(["notification_preferences.update"], {
    after: {
      channels: f.booleans("alertSlack", "alertWebhook"),
      preference: notificationPreference,
    },
    before: {
      channels: f.booleans("alertSlack", "alertWebhook"),
      preference: notificationPreference,
    },
  });
  declare(["settings.presence_inspection_budget.update", "settings.rank_check_frequency.update"], {
    after: projectDefaults,
    before: projectDefaults,
  });
  declare(["settings.hosted_pricing_feedback.submit"], {
    after: { ...f.booleans("answered"), ...strings("category") },
  });
  declare(["project_defaults.update", "settings.defaults.update"], {
    after: {
      market,
      ...f.numbers("movedKeywords", "skippedConflicts"),
      schedule: projectDefaults,
    },
    before: { market, schedule: projectDefaults },
  });

  const importJob = {
    ...strings("error", "id", "jobId", "state"),
    ...f.numbers("chunkCount", "progress"),
  };
  declare(["cloud_import.begin", "cloud_import.create", "cloud_import.session_create"], {
    after: importJob,
  });
  declare(["cloud_import.cancel", "cloud_import.advance"], {
    after: importJob,
    before: importJob,
  });
  declare(["cloud_import.done"], {
    after: { ...importJob, counts: f.numbers("created", "failed", "skipped", "updated") },
  });
  declare(["cloud_import.fail"], { after: importJob });
  declare(
    [
      "project.migration_hold.auto_release",
      "project.migration_hold.cancel",
      "project.migration_hold.enable",
      "project.migration_hold.import_done_release",
      "project.migration_hold.import_failed_release",
      "project.migration_hold.release",
      "project.migration_hold.stale_job_release",
    ],
    {
      after: strings("id", "writeMode"),
      before: { ...strings("id", "writeMode"), ...f.dates("writeModeChangedAt") },
    },
  );

  declare(["rank_check.queue_first"], {
    after: { ...f.numbers("queued"), ...strings("reason") },
  });
  const rankCheckRun = {
    ...(rankCheck as Record<string, AuditFieldPolicy>),
    ...strings("code", "message"),
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
  declare(["settings.run_check_now"], {
    after: { ...f.numbers("failed", "queued", "total"), ...strings("reason") },
  });

  declare(["sample_data.remove"], { before: strings("publicId") });
  declare(["saved_keyword.save"], {
    after: f.numbers("duplicateCount", "savedCount"),
  });
  declare(["saved_keyword.remove"], {
    before: {
      publicIds: list("string"),
      rows: list({
        ...strings("intent", "keyword", "location", "topic"),
        ...f.urls("targetUrl"),
        tags: list("string"),
      }),
    },
  });
  const savedView = strings("name", "savedViewId", "surface");
  declare(["saved_view.create"], { after: savedView });
  declare(["saved_view.delete"], { before: savedView });

  const signal = {
    ...strings(
      "created_at",
      "happened_at",
      "id",
      "keyword_id",
      "project_id",
      "public_id",
      "severity",
      "source",
      "type",
    ),
    ...f.urls("url"),
    payload: {
      ...strings("deploymentId", "environment", "note", "provider"),
      ...f.booleans("test"),
      paths: list("string"),
    },
  };
  declare(["signal.ingested"], { after: signal });
  const signalNote = {
    ...strings("id", "keywordId", "severity"),
    ...f.urls("url"),
    payload: strings("note"),
  };
  declare(["signal.note_added"], { after: signalNote });
  declare(["signal.note_removed"], { before: signalNote });

  declare(["tag.create"], { after: strings("name") });
  declare(["tag.delete"], { before: { ...strings("name"), ...f.numbers("count") } });
  declare(["tag.rename"], {
    after: { ...strings("name"), ...f.numbers("count"), ...f.booleans("merged") },
    before: strings("name"),
  });
  const invite = { ...strings("email", "inviteId", "role"), ...f.dates("expiresAt") };
  declare(["team.invite.accept", "team.invite.create"], { after: invite });
  declare(["team.invite.resend"], { after: invite, before: invite });
  declare(["team.invite.revoke"], { before: invite });
  declare(["team.member.remove"], { before: strings("role") });
  declare(["team.member.role_change"], { after: strings("role"), before: strings("role") });
  declare(["team.ownership.transfer"], {
    after: strings("ownerId", "role"),
    before: strings("targetRole"),
  });
  declare(["triggered_alert.mark_all_read"], { after: f.numbers("acknowledged") });
  declare(["triggered_alert.snooze"], {
    after: { ...f.dates("snoozedUntil"), ...strings("status") },
    before: { ...f.dates("snoozedUntil"), ...strings("status") },
  });

  declare(
    ["provider.connect", "provider.set_settings", "provider.update", "provider.update_cost"],
    {
      after: provider,
      before: provider,
    },
  );
  declare(["provider.disconnect"], { after: provider, before: provider });
  declare(["provider.update_rate"], {
    after: { ...f.numbers("amountCents"), ...strings("feature", "provider") },
    before: { ...f.numbers("amountCents"), ...strings("feature", "provider") },
  });
  declare(["provider.test"], {
    after: { ...f.booleans("ok"), ...strings("provider") },
  });
  declare(["provider.test_failed"], { after: strings("message", "provider") });

  const webhook = {
    ...strings("description", "publicId"),
    ...f.booleans("enabled"),
    ...f.dates("createdAt", "lastDeliveryAt", "updatedAt"),
    ...f.urls("url"),
  };
  declare(["webhook_endpoint.create"], { after: webhook });
  declare(["webhook_endpoint.delete"], { before: webhook });
  declare(["webhook_endpoint.update"], { after: webhook, before: webhook });

  declare(["audit_log.purge"], {
    after: { ...f.dates("cutoff"), ...f.numbers("deletedCount", "retentionDays") },
  });
  declare(["audit_log.view"]);
  declare(
    [
      "authorization.create.forbidden",
      "authorization.delete.forbidden",
      "authorization.manage.forbidden",
      "authorization.read.forbidden",
      "authorization.update.forbidden",
    ],
    {
      after: strings("attemptedAction", "grantedRole", "requiredRole", "resourceType"),
    },
  );
  declare(["auth.sign_in"], { after: strings("email", "method") });
  declare(["instance_admin.first_run_completed"], {
    after: { ...strings("email"), ...f.booleans("isInstanceAdmin") },
    before: f.booleans("isInstanceAdmin"),
  });

  declare(["account.two_factor_backup_codes_regenerated"], {
    after: f.booleans("regenerated"),
  });
  declare(["account.two_factor_disabled"], {
    after: f.booleans("enabled", "sessionsRevoked"),
    before: f.booleans("enabled"),
  });
  declare(["account.two_factor_enrollment_verification_failed"], {
    after: strings("mode"),
  });
  declare(["account.two_factor_enrollment_started", "account.two_factor_replacement_started"], {
    after: { ...f.dates("expiresAt"), ...strings("mode") },
  });
  declare(["account.two_factor_enabled", "account.two_factor_replaced"], {
    after: f.booleans("enabled"),
    before: f.booleans("enabled"),
  });
  declare(["account.two_factor_step_up_failed"], { after: strings("operation") });

  declare(["cloud_import.export_package"], { after: f.numbers("count") });
  declare(["project.self_host_migration.start"], {
    after: {
      ...f.booleans("canRollback"),
      ...f.dates("autoReleasesAt", "startedAt"),
      ...strings("id", "writeMode"),
    },
    before: { ...f.dates("writeModeChangedAt"), ...strings("id", "writeMode") },
  });
  declare(["project.self_host_migration.rollback"], {
    after: strings("id", "writeMode"),
    before: { ...f.dates("writeModeChangedAt"), ...strings("id", "writeMode") },
  });
  declare(["keyword.csv_export", "keyword.json_export", "keyword.xlsx_export"], {
    after: { ...f.numbers("count"), ...strings("format", "scope") },
  });
  declare(["report.weekly_digest_sent"], {
    after: f.numbers("failedChecksCount", "recipients", "topMovers"),
  });
  declare(["sitemap_monitor.disable", "sitemap_monitor.enable"], {
    after: f.booleans("enabled"),
    before: f.booleans("enabled"),
  });
  declare(["traffic.sync_now"], {
    after: f.numbers("connections", "keywordSnapshots", "pageSnapshots", "skipped"),
  });
}
