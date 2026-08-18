// Classification data model for environment variables that appear in runtime
// source but are intentionally excluded from the public starter template and
// the human reference. Public variables are in the public env registry or the
// docs-only set; these allowlists cover the remaining runtime usages.
//
// deploymentInput is the canonical baked-key list imported directly from
// bake-runtime-env.mjs. It is orthogonal deployment capability, not a
// documentation exemption, so it is excluded from classifiedAllowlist() and
// the primary classification categories.

import { bakedRuntimeEnvKeys } from "../deploy/bake-runtime-env.mjs";

export const envClassification = {
  framework: [
    "APP_REVISION",
    "CI",
    "NODE_ENV",
    "NEXT_RUNTIME",
    "NEXT_PHASE",
    "PORT",
  ],
  internal: [
    "TEMPORAL_SCHEDULE_CATCHUP_WINDOW",
    "STALE_IMPORT_JOBS_INTERVAL",
    "ALERT_HEALTH_INTERVAL",
    "ALERT_DELIVERY_SWEEP_INTERVAL",
  ],
  hostedOnly: [
    "AMPLIFY_HOSTING",
    "BISIBILITY_ENV",
    "INDEXNOW_KEY",
    "NEXT_PUBLIC_MARKETING_URL",
    "NOTIFICATION_TRANSPORT",
    "RAILWAY_TEMPLATE_URL",
    "WAITLIST_NOTIFY_EMAIL",
    "RESEND_CONTACTS_API_KEY",
    "RESEND_SEGMENT_CLOUD",
    "RESEND_SEGMENT_EARLY_ADOPTERS",
    "RESEND_SEGMENT_GENERAL",
  ],
  docsOnly: [
    "ALERT_DELIVERY_FAILURE_RATE_THRESHOLD",
    "ALERT_DELIVERY_MIN_ATTEMPTS",
    "ALERT_DELIVERY_WINDOW_HOURS",
    "ALERT_FIRE_SPIKE_MIN",
    "ALERT_FIRE_SPIKE_MULTIPLIER",
    "BISIBILITY_PROVIDER_RATE_LIMIT_PLAUSIBLE_PER_MINUTE",
    "BISIBILITY_PROVIDER_RATE_LIMIT_PLAUSIBLE_WINDOW_SECONDS",
  ],
  test: [
    "ALLOW_INSECURE_FIXED_OTP",
    "BISIBILITY_DEV_SERP_PROVIDER",
    "BISIBILITY_FAKE_PROVIDER",
    "BISIBILITY_SMOKE_REAL_NEXT_SERVER",
    "RANK_CHECK_CUTOVER_ISOLATED_TEST",
    "TEMPORAL_WORKER_SMOKE",
  ],
  migrationOnly: [
    "MIGRATION_ALLOW_INSECURE_LOOPBACK_TARGET",
  ],
  deprecated: [
    "BISIBILITY_GSC_INSPECTION_DAILY_BUDGET",
    "SCHEDULER_MODE",
  ],
  deploymentInput: [...bakedRuntimeEnvKeys],
};

const primaryCategories = [
  "framework",
  "internal",
  "hostedOnly",
  "docsOnly",
  "test",
  "migrationOnly",
  "deprecated",
];

export function classifiedAllowlist() {
  return new Set(
    primaryCategories.flatMap((cat) => envClassification[cat]),
  );
}

export function deploymentInputKeys() {
  return new Set(envClassification.deploymentInput);
}

export function classifyVariable(name) {
  for (const [category, names] of Object.entries(envClassification)) {
    if (names.includes(name)) return category;
  }
  return null;
}

export { primaryCategories };
