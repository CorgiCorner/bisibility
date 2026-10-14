import { registerAccountAuditDeclarations } from "@/lib/auth/audit-field-declarations-account";
import { registerAiTrackingAuditDeclarations } from "@/lib/auth/audit-field-declarations-ai-tracking";
import { registerCompetitorAuditDeclarations } from "@/lib/auth/audit-field-declarations-competitors";
import { registerAdditionalAuditDeclarations } from "@/lib/auth/audit-field-declarations-extra";
import { registerInstanceAdminAuditDeclarations } from "@/lib/auth/audit-field-declarations-instance-admin";
import { registerMailAuditDeclarations } from "@/lib/auth/audit-field-declarations-mail";
import { registerRecoveryAuditDeclarations } from "@/lib/auth/audit-field-declarations-recovery";
import { registerRankCheckRunAuditDeclarations } from "@/lib/auth/audit-field-declarations-runs";
import {
  type AuditFieldPolicy,
  type AuditPayloadPolicy,
  auditFields as f,
} from "@/lib/auth/audit-payload-policy";
import { auditPayloadPolicyExtension } from "./audit-payload-extension";

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

const project = strings("domain", "id", "name", "publicId", "trackingScope", "writeMode");
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
declare(["user.ui_locale.update"], { after: strings("uiLocale"), before: strings("uiLocale") });

registerInstanceAdminAuditDeclarations(declare);

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
declare(["settings.experimental_modules.update"], {
  after: { enabledExperimentalModules: list("string") },
  before: { enabledExperimentalModules: list("string") },
});
declare(["settings.project_market.add"], {
  after: { ...f.numbers("added"), marketIds: list("string") },
});
declare(["project_market.create"], {
  after: { ...f.numbers("keywordCount"), ...strings("method", "scheduleId") },
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
declare(["settings.project_market.update"], {
  after: { futureKeywordDevices: list("string"), ...strings("name") },
  before: { futureKeywordDevices: list("string"), ...strings("name") },
});
declare(["settings.project_market.restore"], {
  after: { ...f.numbers("resumedKeywords"), ...strings("status") },
  before: strings("status"),
});

registerCompetitorAuditDeclarations(declare);
const ingestHook = { ...strings("id", "label"), ...f.booleans("disabled") };
declare(["ingest_hook.create"], { after: ingestHook });
declare(["ingest_hook.delete"], { before: ingestHook });
declare(["ingest_hook.disable", "ingest_hook.rotate"], {
  after: ingestHook,
  before: ingestHook,
});

registerMailAuditDeclarations(declare);

declare(["keyword.bulk_delete"], { before: keywordRows });
declare(["keyword.bulk_clear_target", "keyword.bulk_set_target"], {
  after: f.urls("targetUrl"),
  before: keywordRows,
});
declare(["keyword.target_url_reset"], {
  after: f.urls("targetUrl"),
  before: f.urls("targetUrl"),
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
    ...strings("checkScheduleId", "intent", "topic"),
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
    ...strings("checkScheduleId", "intent", "topic"),
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
registerAccountAuditDeclarations(declare, { projectCounts });
registerRankCheckRunAuditDeclarations(declare);
registerAiTrackingAuditDeclarations(declare);
registerRecoveryAuditDeclarations(declare);

export function auditPayloadPolicy(action: string) {
  return declarations.get(action) ?? auditPayloadPolicyExtension(action) ?? undefined;
}

export function hasDeclaredAuditAction(action: string) {
  return declarations.has(action) || auditPayloadPolicyExtension(action) !== null;
}

export function declaredAuditActions() {
  return [...declarations.keys()].sort();
}
