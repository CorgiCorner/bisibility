import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkLegacyUpgradeContract, LEGACY_UPGRADE_PAGE } from "./legacy-upgrade-contract.mjs";
import { checkSecurityContract } from "./doc-content-security.mjs";
import {
  checkTroubleshootingContract,
  checkTroubleshootingHandoffs,
  runTroubleshootingNegativeProof,
} from "./doc-content-troubleshooting.mjs";
import {
  checkOperationsContract,
  runOperationsNegativeProof,
} from "./doc-content-operations.mjs";

export function checkSelfHostingContract(root, docsRoot) {
  const failures = [];

  const selfHostingPagePaths = [
    "self-hosting.mdx",
    "self-hosting/docker.mdx",
    "self-hosting/upgrades.mdx",
    LEGACY_UPGRADE_PAGE,
    "self-hosting/railway.mdx",
    "self-hosting/temporal.mdx",
    "self-hosting/configuration.mdx",
    "self-hosting/email.mdx",
    "self-hosting/security.mdx",
    "self-hosting/backup-restore.mdx",
    "self-hosting/operations.mdx",
    "self-hosting/troubleshooting.mdx",
  ];
  const selfHostingPages = new Map();
  for (const page of selfHostingPagePaths) {
    const pagePath = join(docsRoot, page);
    if (!existsSync(pagePath)) {
      failures.push(`Self-hosting page is missing: docs/${page}`);
      continue;
    }
    const content = readFileSync(pagePath, "utf8");
    selfHostingPages.set(page, content);
    if (page !== "self-hosting.mdx") {
      const opening = content.slice(0, 600);
      if (!opening.includes("[Production checklist](/self-hosting#production-checklist)")) {
        failures.push(`docs/${page} must link to the production checklist at the top.`);
      }
    }
  }

  const selfHostingDocs = [...selfHostingPages.values()].join("\n");
  for (const term of [
    "https://bisibility.com/deploy/railway",
    "### What the template creates",
    "Eight resources are expected.",
    "A completed bootstrap job is not a crashed service.",
    "two one-shot jobs",
    "immutable release",
  ]) {
    if (!selfHostingDocs.includes(term)) {
      failures.push(`self-hosting.mdx is missing Railway deployment guidance: ${term}`);
    }
  }
  if (selfHostingDocs.includes("https://railway.com/new/template?template=")) {
    failures.push("self-hosting.mdx uses the repository importer instead of the certified Railway template.");
  }
  if (selfHostingDocs.includes("https://railway.com/deploy/")) {
    failures.push("self-hosting.mdx bypasses the stable Bisibility deployment redirect.");
  }

  const selfHostingHub = selfHostingPages.get("self-hosting.mdx") ?? "";
  for (const compatibilityCopy of [
    ["## Moved", "sections"].join(" "),
    ["Existing bookmarks", "remain valid here"].join(" "),
  ]) {
    if (selfHostingHub.includes(compatibilityCopy)) {
      failures.push(`self-hosting.mdx restores pre-stable compatibility copy: ${compatibilityCopy}`);
    }
  }
  for (const term of [
    "## Production topology",
    "| Web/API | Repository `Dockerfile` | Yes |",
    "[Production topology](/self-hosting#production-topology)",
  ]) {
    if (!selfHostingHub.includes(term)) {
      failures.push(`self-hosting.mdx does not expose the production service contract: ${term}`);
    }
  }

  failures.push(...checkLegacyUpgradeContract(selfHostingPages));
  failures.push(...checkSecurityContract(selfHostingPages, docsRoot));

  const selfHostingConfiguration = selfHostingPages.get("self-hosting/configuration.mdx") ?? "";
  if (
    !selfHostingConfiguration.includes(
      "| `SELF_HOSTED_ALLOW_INDEXING` | Self-hosted instances serve restrictive `robots.txt` and no `sitemap.xml` or `llms.txt` by default.",
    )
  ) {
    failures.push("SELF_HOSTED_ALLOW_INDEXING must own the robots and sitemap behavior in its row.");
  }

  const selfHostingEmail = selfHostingPages.get("self-hosting/email.mdx") ?? "";
  for (const term of ["EMAIL_PROVIDER", "RESEND_API_KEY", "SES_REGION", "SMTP_URL", "sandbox"]) {
    if (!selfHostingEmail.includes(term)) {
      failures.push(`self-hosting/email.mdx is missing required coverage: ${term}`);
    }
  }

  const backupRestore = selfHostingPages.get("self-hosting/backup-restore.mdx") ?? "";
  if (!backupRestore) {
    failures.push("self-hosting/backup-restore.mdx is missing.");
  }
  for (const term of [
    "PostgreSQL is the source of truth",
    "BETTER_AUTH_SECRET",
    "BISIBILITY_SECRETS_KEY",
    "Valkey normally does not require durable backup.",
    "temporal-postgres",
    "pg_dump -U bisibility -d bisibility --format=custom",
    "pg_restore --list",
    "pg_restore --exit-on-error --clean --if-exists --no-owner",
    "Restore with the same bisibility release that created the dump",
    "stop app",
    "stop worker",
    "run --rm db-migrations",
    "/api/v1/readiness",
    "is destructive",
    "restore rehearsals prove",
  ]) {
    if (!backupRestore.includes(term)) {
      failures.push(`self-hosting/backup-restore.mdx is missing required coverage: ${term}`);
    }
  }
  const backupRestoreOpsPointer = selfHostingPages.get("self-hosting/operations.mdx") ?? "";
  if (!backupRestoreOpsPointer.includes("[Backup and restore](/self-hosting/backup-restore)")) {
    failures.push("self-hosting/operations.mdx must point to /self-hosting/backup-restore.");
  }

  failures.push(...checkUpgradesContract(selfHostingPages));
  failures.push(...checkGuideHandoff(docsRoot));
  failures.push(...checkTroubleshootingContract(docsRoot));
  failures.push(...checkTroubleshootingHandoffs(selfHostingPages, docsRoot));
  failures.push(...runTroubleshootingNegativeProof(docsRoot));
  failures.push(...checkOperationsContract(docsRoot));
  failures.push(...runOperationsNegativeProof(docsRoot));

  return failures;
}

const UPGRADE_HEADINGS = [
  "### Prerequisites",
  "### Backup as rollback",
  "### Verify release assets",
  "### Stop services",
  "### Run migrations",
  "### Restart",
  "### Validate readiness",
  "### Failure paths",
  "### Restore from backup",
  "### Legacy upgrades",
];

function checkUpgradesContract(selfHostingPages) {
  const failures = [];
  const upgrades = selfHostingPages.get("self-hosting/upgrades.mdx") ?? "";
  if (!upgrades) {
    failures.push("self-hosting/upgrades.mdx is missing.");
    return failures;
  }

  const legacyMarker = '<span id="upgrade-from-v010-to-v020"></span>';
  const legacyIndex = upgrades.indexOf(legacyMarker);
  if (legacyIndex === -1) {
    failures.push("self-hosting/upgrades.mdx is missing the legacy upgrade marker.");
    return failures;
  }

  let lastIndex = -1;
  for (const heading of UPGRADE_HEADINGS) {
    const count = upgrades.split(heading).length - 1;
    if (count === 0) {
      failures.push(`self-hosting/upgrades.mdx is missing heading: ${heading}`);
      continue;
    }
    if (count > 1) {
      failures.push(`self-hosting/upgrades.mdx has duplicate heading: ${heading}`);
      continue;
    }
    const idx = upgrades.indexOf(heading);
    if (idx > legacyIndex) {
      failures.push(`self-hosting/upgrades.mdx heading ${heading} appears after the legacy section.`);
    }
    if (idx < lastIndex) {
      failures.push(`self-hosting/upgrades.mdx heading ${heading} is out of order.`);
    }
    lastIndex = idx;
  }

  for (const term of [
    "[Backup and restore](/self-hosting/backup-restore)",
    "upgrade.sh",
    "compose.yaml",
    "--compose-file",
    "compose.worker.yaml",
    "compose.temporal.yaml",
    "prisma migrate deploy",
    "db-migrations",
    "does not perform automatic rollback",
    "(/self-hosting/legacy-upgrades/v0-1-to-v0-2)",
    "GET /api/v1/health",
    "services.migrations",
    "INTERNAL_PROBE_TOKEN",
    "prisma migrate status",
    "Never enable demo OTP",
  ]) {
    if (!upgrades.includes(term)) {
      failures.push(`self-hosting/upgrades.mdx is missing required coverage: ${term}`);
    }
  }

  if (/`\/api\/v1\/readiness`[^.]*public liveness check/s.test(upgrades)) {
    failures.push(
      "self-hosting/upgrades.mdx must not describe /api/v1/readiness as a public liveness check; it is the traffic-admission (readiness) probe.",
    );
  }
  if (
    !/`\/api\/v1\/readiness`[^.]*traffic-admission[^.]*readiness[^.]*probe/s.test(upgrades)
  ) {
    failures.push(
      "self-hosting/upgrades.mdx must describe /api/v1/readiness as a traffic-admission (readiness) probe.",
    );
  }
  if (
    !/--compose-file compose\.yaml\s+\\\n\s+--compose-file compose\.worker\.yaml\s+\\\n\s+--compose-file compose\.temporal\.yaml/.test(
      upgrades,
    )
  ) {
    failures.push(
      "self-hosting/upgrades.mdx must layer compose.yaml before the worker and Temporal overlays.",
    );
  }

  return failures;
}

function checkGuideHandoff(docsRoot) {
  const failures = [];
  const guidePath = join(docsRoot, "guides/operations.mdx");
  if (!existsSync(guidePath)) {
    failures.push("guides/operations.mdx is missing.");
    return failures;
  }
  const guide = readFileSync(guidePath, "utf8");

  for (const term of [
    "[Self-hosted upgrades](/self-hosting/upgrades)",
    "[Backup and restore](/self-hosting/backup-restore)",
  ]) {
    if (!guide.includes(term)) {
      failures.push(`guides/operations.mdx must link to the canonical page: ${term}`);
    }
  }

  for (const forbidden of [
    "./upgrade.sh --version",
    "prisma migrate deploy",
    "pg_restore",
    "npm run db:backfill:competitor-organics",
  ]) {
    if (guide.includes(forbidden)) {
      failures.push(`guides/operations.mdx must not contain upgrade implementation: ${forbidden}`);
    }
  }

  for (const heading of [
    "## What to back up",
    "## Upgrade Docker Compose",
    "## Keep web and worker on the same version",
    "## Verify and roll back",
  ]) {
    if (!guide.includes(heading)) {
      failures.push(`guides/operations.mdx is missing stable heading: ${heading}`);
    }
  }

  return failures;
}
