import { registerAdditionalAuditDeclarations } from "@/lib/auth/audit-field-declarations-extra";
import {
  type AuditFieldPolicy,
  type AuditPayloadPolicy,
  auditFields as f,
} from "@/lib/auth/audit-payload-policy";

// This published registry is the audit payload contract. Missing actions retain row metadata only.
const declarations = new Map<string, AuditPayloadPolicy>();
const list = (policy: AuditFieldPolicy): readonly [AuditFieldPolicy] => [policy];
const strings = (...names: string[]) => f.strings(...names);

function declare(actions: readonly string[], policy: AuditPayloadPolicy = {}) {
  for (const action of actions) {
    if (declarations.has(action)) throw new Error(`Duplicate audit declaration: ${action}`);
    declarations.set(action, policy);
  }
}

const project = {
  ...strings("domain", "id", "name", "publicId", "trackingScope", "writeMode"),
};
const projectCounts = {
  ...f.numbers(
    "accounts",
    "apiKeys",
    "keywords",
    "members",
    "memberships",
    "projects",
    "providerConnections",
    "sessions",
  ),
};
const schedule = {
  ...strings("city", "country", "cronExpression", "device", "frequency", "locationKey", "timezone"),
  ...f.numbers("inspectionDailyLimit", "jitterMinutes", "serpDepth"),
  ...f.booleans("serpStopOnMatch"),
  ...f.dates("lastCheckedAt", "nextCheckAt"),
};
const market = {
  ...strings("city", "country", "device", "displayName", "locationKey", "source"),
};
const projectDefaults = { ...schedule, ...market };
const keyword = {
  ...strings("device", "id", "intent", "keywordId", "location", "text", "topic"),
  ...f.urls("targetUrl"),
};
const keywordRows = list(keyword);
const alertRule = {
  ...strings(
    "competitorDomain",
    "conditionType",
    "id",
    "name",
    "serpFeature",
    "severity",
    "targetType",
  ),
  ...f.numbers("changePct", "dropPositions", "thresholdPosition", "topN"),
  ...f.booleans("enabled"),
  channels: list("string"),
};
const token = {
  ...strings("id", "name", "prefix", "scope"),
  ...f.dates("consumedAt", "expiresAt", "revokedAt"),
  ...f.booleans("singleUse"),
  scopes: list("string"),
};
const provider = {
  ...f.scalars("costPerCheck"),
  ...strings("id", "kind", "permissionLevel", "property", "provider", "status"),
  ...f.booleans("enabled", "hasCredentials"),
  ...f.numbers("priority"),
};
const rankCheck = {
  ...strings("error", "keywordId", "provider", "rankCheckId", "reason", "status", "text"),
  ...f.numbers(
    "attemptCount",
    "attempts",
    "billingUnits",
    "costCents",
    "estimatedCostCents",
    "position",
    "requestedDepth",
  ),
  ...f.booleans("preview"),
  ...f.dates("checkedAt"),
};

declare(["project.create", "sample_data.install"], { after: project });
declare(["project.delete"], {
  before: { ...project, _count: projectCounts, counts: projectCounts },
});
declare(
  [
    "project.update",
    "settings.project_details.update",
    "settings.project_domain.set",
    "settings.project_domain.update",
  ],
  {
    after: project,
    before: project,
  },
);
declare(["settings.project_tracking_scope.update"], { after: project, before: project });
declare(["onboarding.matching_scope.set"], {
  after: { ...f.booleans("includeSubdomains", "rootAndWww"), ...f.urls("urlPrefix") },
});

declare(["account.profile_updated"], {
  after: strings("name"),
  before: strings("name"),
});
declare(["account.avatar_updated"], {
  after: f.urls("image"),
  before: f.urls("image"),
});
declare(["account.email_change_requested", "account.email_changed"], {
  after: strings("email"),
  before: strings("email"),
});
declare(["account.email_verification_requested"], {
  after: strings("email"),
});
declare(["account.email_verified"], {
  after: { ...strings("email"), ...f.booleans("emailVerified") },
  before: { ...strings("email"), ...f.booleans("emailVerified") },
});
declare(["account.deleted"], {
  before: { ...strings("email", "name"), counts: projectCounts },
});
declare(["account.session_revoked"], {
  before: strings("id", "ipAddress", "userAgent"),
});
declare(["account.sessions_revoked"], { after: f.numbers("revokedCount") });
declare(["instance_admin.delete_blocked"], { before: f.booleans("isInstanceAdmin") });

declare(["alert_rule.create"], { after: alertRule });
declare(["alert_rule.delete"], { before: alertRule });
declare(["alert_rule.update", "alert_rule.set_enabled"], { after: alertRule, before: alertRule });
declare(["slack_connection.create", "slack_connection.update"], {
  after: {
    ...strings("channelId", "channelName", "id", "installedById", "scope", "teamId", "teamName"),
    ...f.booleans("enabled"),
    ...f.dates("installedAt", "updatedAt"),
  },
  before: {
    ...strings("channelId", "channelName", "id", "installedById", "scope", "teamId", "teamName"),
    ...f.booleans("enabled"),
    ...f.dates("installedAt", "updatedAt"),
  },
});

declare(["api_key.issue"], { after: token });
declare(["api_key.regenerate", "api_key.revoke", "pat.revoke", "migration_token.revoke"], {
  after: token,
  before: token,
});
declare(["pat.issue", "pat.exchange_login"], { after: token });
declare(["migration_token.mint", "migration_token.regenerate"], { after: token });
declare(["migration_token.consume"], { after: token });
declare(["settings.budget_updated"], {
  after: f.numbers("capCents"),
  before: f.numbers("capCents"),
});
declare(["settings.project_market.add"], {
  after: { ...f.numbers("added"), marketIds: list("string") },
});
declare(["onboarding.project_markets.reconcile"], {
  after: {
    ...f.numbers("added"),
    marketIds: list("string"),
    removedMarketIds: list("string"),
  },
  before: { marketIds: list("string") },
});
declare(
  [
    "settings.project_market.pause",
    "settings.project_market.remove",
    "settings.project_market.resume",
  ],
  {
    after: strings("status"),
    before: strings("status"),
  },
);

const competitor = { ...strings("domain", "id", "label") };
declare(["competitor.add"], { after: competitor });
declare(["competitor.remove"], { before: competitor });
declare(["competitor.rename"], { after: competitor, before: competitor });
const ingestHook = { ...strings("id", "label"), ...f.booleans("disabled") };
declare(["ingest_hook.create"], { after: ingestHook });
declare(["ingest_hook.delete"], { before: ingestHook });
declare(["ingest_hook.disable", "ingest_hook.rotate"], {
  after: ingestHook,
  before: ingestHook,
});

declare(
  [
    "instance_admin.account_deactivate_failed",
    "instance_admin.account_deactivate_rate_limited",
    "instance_admin.account_limits_reset_failed",
    "instance_admin.account_limits_reset_rate_limited",
    "instance_admin.account_reactivate_failed",
    "instance_admin.account_reactivate_rate_limited",
  ],
  { after: strings("requestedTarget") },
);
declare(["instance_admin.account_deactivate_blocked"], {
  before: { ...f.dates("deactivatedAt"), ...f.booleans("isInstanceAdmin") },
});
declare(["instance_admin.account_deactivated", "instance_admin.account_reactivated"], {
  after: f.dates("deactivatedAt"),
  before: f.dates("deactivatedAt"),
});
declare(["instance_admin.account_limits_reset"], {
  after: {
    ...f.booleans("budgetReset"),
    ...f.numbers("clearedBuckets"),
    ...strings("requestedTarget"),
  },
});
declare(["instance_admin.account_viewed"], { after: strings("result") });
declare(
  [
    "instance_admin.ops_sweep.failed",
    "instance_admin.ops_sweep.rate_limited",
    "instance_admin.ops_sweep.run",
  ],
  { after: { ...f.numbers("attempted", "delivered"), ...strings("result") } },
);
declare(
  [
    "instance_admin.ops_test.failed",
    "instance_admin.ops_test.rate_limited",
    "instance_admin.ops_test.send",
  ],
  { after: strings("result") },
);

declare(["keyword.bulk_delete"], { before: keywordRows });
declare(["keyword.bulk_clear_target", "keyword.bulk_set_target"], {
  after: f.urls("targetUrl"),
  before: keywordRows,
});
declare(["keyword.bulk_set_frequency"], {
  after: { keywordIds: list("string"), schedule },
});
declare(["keyword.bulk_tag"], {
  after: { keywordIds: list("string"), tags: list("string") },
});
declare(["keyword.csv_import"], {
  after: { created: list("string"), ...f.numbers("failed", "skipped") },
});
declare(["keyword.matrix_add"], {
  after: {
    ...strings("intent", "topic"),
    ...f.numbers("skippedDuplicates"),
    ...f.urls("targetUrl"),
    keywordIds: list("string"),
    tags: list("string"),
  },
});
declare(["keyword_schedule.update"], { after: schedule, before: schedule });
declare(["keyword.add"], { after: { ...keyword, tags: list("string") } });
declare(["keyword.batch_add"], {
  after: {
    ...strings("intent", "topic"),
    ...f.numbers("created", "skipped"),
    ...f.urls("targetUrl"),
    keywordIds: list("string"),
    rows: list({ ...keyword, keyword: "string", tags: list("string") }),
    tags: list("string"),
  },
});
declare(["keyword.update"], {
  after: { ...keyword, tags: list("string") },
  before: keyword,
});
declare(
  [
    "keyword.bulk.add_tags",
    "keyword.bulk.delete",
    "keyword.bulk.remove_tags",
    "keyword.bulk.set_frequency",
    "keyword.bulk.set_target_url",
  ],
  { after: { ...f.numbers("count"), ...strings("operation") } },
);
declare(["keyword.delete"], { before: keyword });

registerAdditionalAuditDeclarations(declare, {
  market,
  projectDefaults,
  provider,
  rankCheck,
});

export function auditPayloadPolicy(action: string) {
  return declarations.get(action);
}

export function hasDeclaredAuditAction(action: string) {
  return declarations.has(action);
}

export function declaredAuditActions() {
  return [...declarations.keys()].sort();
}
