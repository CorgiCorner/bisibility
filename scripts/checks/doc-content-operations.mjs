import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OPERATIONS_PAGE = "self-hosting/operations.mdx";

const REQUIRED_HEADINGS = [
  "## Client IP behind a proxy",
  "## Operator observability (optional)",
  "## Instance admin",
  "## Routine operational checks",
  "## Back up and restore PostgreSQL",
  "## Database growth",
];

const REQUIRED_LINKS = [
  "/self-hosting/security#trusted-client-ip",
  "/self-hosting/security#admin-recovery",
  "/self-hosting/configuration#operator-observability",
  "/self-hosting/configuration",
  "/self-hosting/backup-restore",
  "/self-hosting/troubleshooting",
  "/self-hosting/upgrades",
];

const REQUIRED_TERMS = [
  "OPS_SLACK_WEBHOOK_URL",
  "no `SlackConnection`",
  "OPS_SLACK_INCLUDE_NAMES=1",
  "identifiers and counts only",
  "outbox",
  "The next heartbeat retries",
  "Records remain for 30 days",
  "26 hours is stale and returns HTTP 503",
  "external dead-man monitor",
  "OPS_HEARTBEAT_TZ",
  "Europe/Warsaw` to `Etc/UTC",
  "node --experimental-transform-types scripts/ops/send-test-notification.ts",
  "seed-instance-admin.ts",
  "--force",
  "idempotent",
  "grants no tenant project access",
  "rank_checks",
  "organicRanks",
  "03:29 UTC",
  "03:41 UTC",
  "1,000 eligible",
  "100 batches",
  "content-free retry fence",
  "restore rehearsal",
  "exact release revision",
  "Worker revision",
  "notification delivery",
  "backup",
];

const FORBIDDEN_TERMS = [
  "| Variable | Default | Purpose |",
  "BISIBILITY_FAKE_PROVIDER=1",
  "Each Google Cloud project owns its Google API quota",
  "proxy_set_header X-Real-IP",
  "BISIBILITY_CLIENT_IP_XFF_DEPTH` to the number of entries",
  "x-forwarded-for`.",
  "reset-two-factor.ts",
  "--confirm-reset-2fa",
  "pg_dump",
  "pg_restore",
  "upgrade.sh",
  "prisma migrate deploy",
  "| Symptom | Check | Resolution |",
];

export function checkOperationsContract(docsRoot) {
  const failures = [];
  const pagePath = join(docsRoot, OPERATIONS_PAGE);
  if (!existsSync(pagePath)) {
    failures.push(`docs/${OPERATIONS_PAGE} is missing.`);
    return failures;
  }
  const source = readFileSync(pagePath, "utf8");
  failures.push(...checkOperationsContent(source));
  return failures;
}

export function checkOperationsContent(source) {
  const failures = [];

  const opening = source.slice(0, 600);
  if (!opening.includes("[Production checklist](/self-hosting#production-checklist)")) {
    failures.push("operations.mdx must link to the production checklist at the top.");
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!source.includes(heading)) {
      failures.push(`operations.mdx is missing heading: ${heading}`);
    }
  }

  for (const link of REQUIRED_LINKS) {
    if (!source.includes(link)) {
      failures.push(`operations.mdx is missing canonical link: ${link}`);
    }
  }

  for (const term of REQUIRED_TERMS) {
    if (!source.includes(term)) {
      failures.push(`operations.mdx is missing required coverage: ${term}`);
    }
  }

  for (const term of FORBIDDEN_TERMS) {
    if (source.includes(term)) {
      failures.push(`operations.mdx must not contain: ${term}`);
    }
  }

  const lineCount = source.trimEnd().split("\n").length;
  if (lineCount > 155) {
    failures.push(`operations.mdx must not exceed 155 lines (currently ${lineCount}).`);
  }

  return failures;
}

export function runOperationsNegativeProof(docsRoot) {
  const pagePath = join(docsRoot, OPERATIONS_PAGE);
  if (!existsSync(pagePath)) {
    return ["operations negative proof skipped: page is missing (reported elsewhere)."];
  }
  const original = readFileSync(pagePath, "utf8");
  const failures = [];

  const missingMigrationNote = original.replace(
    "> **Upgrade note:** The default `OPS_HEARTBEAT_TZ` for installations that do not set it explicitly\n> changed from `Europe/Warsaw` to `Etc/UTC`. Set `OPS_HEARTBEAT_TZ=Europe/Warsaw` before upgrading to\n> preserve the previous schedule.",
    "",
  );
  const migrationFailures = checkOperationsContent(missingMigrationNote);
  if (migrationFailures.length === 0) {
    failures.push(
      "operations negative proof failed: removing the Warsaw-to-UTC migration note did not produce a failure.",
    );
  }

  const weakenedBoundary = original.replace(
    "grants no tenant project access.",
    "provides cross-instance operations.",
  );
  const boundaryFailures = checkOperationsContent(weakenedBoundary);
  if (boundaryFailures.length === 0) {
    failures.push(
      "operations negative proof failed: weakening the instance-admin no-tenant-access boundary did not produce a failure.",
    );
  }

  const missingRehearsal = original.replace(
    "- **Backup freshness and restore rehearsal:** Confirm recent backups exist and perform a restore\n  rehearsal through the canonical [Backup and restore](/self-hosting/backup-restore) owner. A backup\n  that has never been restored is unverified.",
    "- **Backup freshness:** Confirm recent backups exist through the canonical\n  [Backup and restore](/self-hosting/backup-restore) owner.",
  );
  const rehearsalFailures = checkOperationsContent(missingRehearsal);
  if (rehearsalFailures.length === 0) {
    failures.push(
      "operations negative proof failed: deleting a routine backup/restore rehearsal check did not produce a failure.",
    );
  }

  return failures;
}
